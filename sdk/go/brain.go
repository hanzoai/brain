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
	"io"
	"time"
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

	// RunRecipe executes a named recipe (yaml-defined workflow) against
	// the brain. Recipes live in ~/.hanzo/brain/recipes/ and chain
	// queries + transformations into a single named operation.
	RunRecipe(ctx context.Context, name string, args map[string]any) (*RecipeResult, error)

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

// RecipeResult is the return of RunRecipe.
type RecipeResult struct {
	Name      string
	Status    string // ok | error
	// Output is the recipe's structured result. Shape is recipe-
	// specific.
	Output    map[string]any
	StartedAt time.Time
	FinishedAt time.Time
}
