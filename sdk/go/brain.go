// Package brain — canonical Go client interface for Hanzo Brain.
//
// Hanzo Brain is the single-binary knowledge graph: SQLite + FTS5,
// zero-LLM typed edge extraction, one ~/.hanzo/brain/brain.db shared
// by every runtime (TS, Python, Rust, Go).
//
//	import brain "github.com/hanzoai/brain/sdk/go"
//	var b brain.Brain = brain.Open(cfg)

package brain

import (
	"context"
	"errors"
	"io"
	"time"
)

// Typed errors. Callers branch via errors.Is.
var (
	ErrDocNotFound       = errors.New("brain: document not found")
	ErrRecipeNotFound    = errors.New("brain: recipe not found")
	ErrRecipeArgsInvalid = errors.New("brain: recipe args failed schema validation")
	ErrRecipeTimeout     = errors.New("brain: recipe execution exceeded MaxDurationSeconds")
	ErrRecipeRejected    = errors.New("brain: recipe rejected by policy")
)

// Brain is the knowledge-graph surface: ingest documents, query
// facts, traverse edges, subscribe to changes, recipe execution.
type Brain interface {
	// Kind reports the backend identifier (hanzo-brain).
	Kind() string

	// Ingest stores a document and triggers edge extraction. The
	// document body is markdown; vendor reads frontmatter for typed
	// metadata. Returns the assigned document id.
	Ingest(ctx context.Context, doc Document) (docID string, err error)

	// IngestStream is the streaming equivalent for large bodies.
	IngestStream(ctx context.Context, meta Document, body io.Reader) (docID string, err error)

	// GetDoc returns one document by id.
	GetDoc(ctx context.Context, docID string) (*Document, error)

	// DeleteDoc removes a document and its derived edges. Idempotent.
	DeleteDoc(ctx context.Context, docID string) error

	// Search runs a full-text query against the indexed corpus.
	// Returns ranked snippets.
	Search(ctx context.Context, req SearchRequest) ([]SearchHit, error)

	// Facts returns the typed facts about a subject.
	Facts(ctx context.Context, subject string) ([]Fact, error)

	// AddFact persists a typed fact. The brain's edge extractor
	// auto-emits facts from documents at ingest; this method exists
	// for programmatic insertion from agents.
	AddFact(ctx context.Context, fact Fact) error

	// Traverse walks the edge graph from one subject. Direction is
	// "out" (subject->object) or "in" (object->subject). Depth caps
	// the BFS expansion.
	Traverse(ctx context.Context, req TraverseRequest) ([]Edge, error)

	// Watch opens a channel of change events. Closing ctx terminates
	// the stream. Useful for keeping derived caches fresh.
	Watch(ctx context.Context, filter WatchFilter) (<-chan ChangeEvent, error)

	// ListRecipes enumerates the recipes the brain can run, with each
	// recipe's input JSON Schema. Callers introspect the schema before
	// constructing a RecipeRequest; RunRecipe validates against the
	// same schema server-side, so this is for discovery + tooling, not
	// authority.
	ListRecipes(ctx context.Context) ([]RecipeDescription, error)

	// DescribeRecipe returns one recipe's metadata + input schema.
	// ErrRecipeNotFound on miss.
	DescribeRecipe(ctx context.Context, name string) (*RecipeDescription, error)

	// RunRecipe executes a named recipe (yaml-defined workflow).
	//
	// Validation contract (the implementation MUST enforce all):
	//   - Recipe must exist (ErrRecipeNotFound) and be enabled for the
	//     caller's org.
	//   - Args MUST validate against the recipe's input JSON Schema
	//     (ErrRecipeArgsInvalid). The wrapped *RecipeValidationError
	//     names the offending field path + JSON Schema keyword.
	//   - Args carrying file paths, URLs, or shell-fragments MUST go
	//     through the recipe's allow-list — recipes that touch the
	//     filesystem declare a `path_allow` regex; the impl rejects
	//     args that fail this regex with ErrRecipeRejected.
	//   - MaxDurationSeconds is mandatory and bounded by the recipe's
	//     declared upper limit. Exceeding it returns ErrRecipeTimeout.
	//   - IdempotencyKey: same key + canonical(Name, Args) returns the
	//     cached RecipeResult.
	//
	// Args is map[string]any to keep recipe definitions extensible at
	// the data plane, but the schema-validation step turns it into a
	// typed surface from the caller's perspective.
	RunRecipe(ctx context.Context, req RecipeRequest) (*RecipeResult, error)

	// Close releases the underlying SQLite handle.
	Close() error
}

// Document is one ingested record.
type Document struct {
	ID         string
	Source     string // workspace | mcp | agent | api
	Path       string // relative path under ~/.hanzo/workspace/ (when from disk)
	Title      string
	Body       string
	// Frontmatter is the parsed YAML front matter, typed-keyed for
	// search + filter.
	Frontmatter map[string]any
	Tags        []string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// SearchRequest is the query shape.
type SearchRequest struct {
	Query string
	// Limit caps the result count. 0 = brain default (50).
	Limit int
	// Tag restricts results to docs carrying any of these tags.
	Tags []string
	// Since restricts to docs ingested after this time.
	Since time.Time
}

// SearchHit is one ranked search result.
type SearchHit struct {
	DocID    string
	Title    string
	Snippet  string // FTS5 highlight-context excerpt
	Score    float64
	UpdatedAt time.Time
}

// Fact is one typed (subject, predicate, object) triple.
type Fact struct {
	Subject   string
	Predicate string
	Object    string
	// Confidence in [0,1]. Auto-extracted facts default to 0.7;
	// human-asserted facts default to 1.0.
	Confidence float64
	// Source names where the fact came from (docID, agent name, api).
	Source    string
	CreatedAt time.Time
}

// TraverseRequest scopes a graph walk.
type TraverseRequest struct {
	Subject   string
	Direction string // out | in | both
	Depth     int    // BFS depth cap; 0 = brain default (3)
	// Predicates restricts traversal to specific edge predicates;
	// empty = follow all.
	Predicates []string
}

// Edge is one resolved graph edge.
type Edge struct {
	From       string
	To         string
	Predicate  string
	Confidence float64
	// Path is the BFS path from the original subject (length = hop
	// distance); first element is the source subject, last element
	// is To.
	Path []string
}

// WatchFilter scopes a Watch stream.
type WatchFilter struct {
	// Kinds is the change-kind filter (doc.ingested | doc.updated |
	// doc.deleted | fact.added | fact.removed). Empty = all.
	Kinds []string
	// Tags restricts doc changes to docs carrying any tag.
	Tags []string
}

// ChangeEvent is one streaming change notification.
type ChangeEvent struct {
	Kind string
	// DocID populated for doc events.
	DocID string
	// Fact populated for fact events.
	Fact *Fact
	At   time.Time
}

// RecipeRequest is the typed envelope for RunRecipe.
type RecipeRequest struct {
	Name string
	// Args must validate against the recipe's input JSON Schema.
	Args map[string]any
	// MaxDurationSeconds caps execution; recipes declare an upper
	// bound and the impl rejects values above it. Zero is invalid —
	// callers MUST pick a budget.
	MaxDurationSeconds int
	// IdempotencyKey lets safe retries replay the cached result.
	// Optional but recommended for write-heavy recipes.
	IdempotencyKey string
}

// RecipeDescription is the introspection record returned by
// ListRecipes / DescribeRecipe.
type RecipeDescription struct {
	Name        string
	Description string
	// InputSchema is the recipe's JSON Schema (draft 2020-12) for
	// Args. Implementations carry it as a parsed JSON object rather
	// than a raw string so callers can introspect properties.
	InputSchema map[string]any
	// OutputShape describes the recipe's RecipeResult.Output keys.
	OutputShape map[string]any
	// MaxDurationSecondsLimit is the recipe's declared upper bound
	// for RecipeRequest.MaxDurationSeconds.
	MaxDurationSecondsLimit int
	// SideEffects flags the kinds of work a recipe performs: fs_read |
	// fs_write | network | shell | db_write. Callers can surface this
	// at confirm-time before invoking.
	SideEffects []string
	UpdatedAt   time.Time
}

// RecipeValidationError details a schema validation failure.
type RecipeValidationError struct {
	// FieldPath is the JSON Pointer to the offending field
	// (e.g. "/args/path").
	FieldPath string
	// Keyword is the JSON Schema keyword that rejected the value
	// (type, required, pattern, enum, ...).
	Keyword string
	// Message is a human-readable detail line.
	Message string
}

func (e *RecipeValidationError) Error() string {
	return "brain: recipe arg " + e.FieldPath + ": " + e.Message
}

// RecipeResult is the return of RunRecipe.
type RecipeResult struct {
	Name      string
	Status    string // ok | error
	// Output is the recipe's structured result. Shape is recipe-
	// specific; see RecipeDescription.OutputShape for keys.
	Output    map[string]any
	StartedAt time.Time
	FinishedAt time.Time
}
