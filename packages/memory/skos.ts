/**
 * W3C SKOS (Simple Knowledge Organization System) concept tree.
 *
 * Reference: Miles & Bechhofer (2009) — W3C Recommendation.
 * Properties supported: prefLabel, altLabel, hiddenLabel, broader,
 * narrower, related, scopeNote, inScheme, topConceptOf.
 *
 * Export: Turtle (RDF/Turtle) with the SKOS namespace.
 */

export interface Concept {
  uri: string;
  prefLabel: string;
  altLabels?: string[];
  hiddenLabels?: string[];
  broader?: string[];
  narrower?: string[];
  related?: string[];
  scopeNote?: string;
  inScheme?: string;
  topConceptOf?: string;
}

export interface ConceptScheme {
  uri: string;
  prefLabel: string;
  topConcepts: string[];
}

export class SkosGraph {
  private concepts = new Map<string, Concept>();
  private schemes = new Map<string, ConceptScheme>();

  addConcept(c: Concept): void {
    const prev = this.concepts.get(c.uri);
    this.concepts.set(c.uri, { ...prev, ...c });
    // maintain inverse links for broader/narrower
    if (c.broader) {
      for (const b of c.broader) this.touchNarrower(b, c.uri);
    }
    if (c.narrower) {
      for (const n of c.narrower) this.touchBroader(n, c.uri);
    }
  }

  addScheme(s: ConceptScheme): void {
    this.schemes.set(s.uri, s);
  }

  get(uri: string): Concept | undefined {
    return this.concepts.get(uri);
  }

  list(): Concept[] {
    return Array.from(this.concepts.values());
  }

  /** Closure of broader transitively. Includes the starting concept. */
  broaderClosure(uri: string): string[] {
    const seen = new Set<string>();
    const stack = [uri];
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      const c = this.concepts.get(cur);
      if (c?.broader) for (const b of c.broader) stack.push(b);
    }
    return [...seen];
  }

  /** Closure of narrower transitively. */
  narrowerClosure(uri: string): string[] {
    const seen = new Set<string>();
    const stack = [uri];
    while (stack.length) {
      const cur = stack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      const c = this.concepts.get(cur);
      if (c?.narrower) for (const n of c.narrower) stack.push(n);
    }
    return [...seen];
  }

  /** Render the graph as RDF/Turtle. */
  toTurtle(): string {
    const lines: string[] = [
      "@prefix skos: <http://www.w3.org/2004/02/skos/core#> .",
      "@prefix dct: <http://purl.org/dc/terms/> .",
      "",
    ];
    for (const s of this.schemes.values()) {
      lines.push(`<${s.uri}> a skos:ConceptScheme ;`);
      lines.push(`    skos:prefLabel ${turtleLit(s.prefLabel)} ;`);
      if (s.topConcepts.length > 0) {
        const tc = s.topConcepts.map((u) => `<${u}>`).join(", ");
        lines.push(`    skos:hasTopConcept ${tc} .`);
      } else {
        lines[lines.length - 1] = lines[lines.length - 1].replace(/ ;$/, " .");
      }
      lines.push("");
    }
    for (const c of this.concepts.values()) {
      const parts: string[] = [`<${c.uri}> a skos:Concept`];
      parts.push(`    skos:prefLabel ${turtleLit(c.prefLabel)}`);
      if (c.altLabels) for (const l of c.altLabels) parts.push(`    skos:altLabel ${turtleLit(l)}`);
      if (c.hiddenLabels) for (const l of c.hiddenLabels) parts.push(`    skos:hiddenLabel ${turtleLit(l)}`);
      if (c.broader) for (const u of c.broader) parts.push(`    skos:broader <${u}>`);
      if (c.narrower) for (const u of c.narrower) parts.push(`    skos:narrower <${u}>`);
      if (c.related) for (const u of c.related) parts.push(`    skos:related <${u}>`);
      if (c.scopeNote) parts.push(`    skos:scopeNote ${turtleLit(c.scopeNote)}`);
      if (c.inScheme) parts.push(`    skos:inScheme <${c.inScheme}>`);
      if (c.topConceptOf) parts.push(`    skos:topConceptOf <${c.topConceptOf}>`);
      lines.push(parts.join(" ;\n") + " .");
      lines.push("");
    }
    return lines.join("\n");
  }

  private touchBroader(uri: string, broaderUri: string): void {
    const c = this.concepts.get(uri) ?? { uri, prefLabel: uri };
    c.broader = unique([...(c.broader ?? []), broaderUri]);
    this.concepts.set(uri, c);
  }

  private touchNarrower(uri: string, narrowerUri: string): void {
    const c = this.concepts.get(uri) ?? { uri, prefLabel: uri };
    c.narrower = unique([...(c.narrower ?? []), narrowerUri]);
    this.concepts.set(uri, c);
  }
}

function unique<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

function turtleLit(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
