/**
 * FAIR metadata export.
 *
 * Wilkinson et al. (2016) — Findable, Accessible, Interoperable,
 * Reusable. Two emission formats:
 *
 *   - Dublin Core (ISO 15836): the 15-element vocabulary
 *   - JSON-LD with schema.org / DCTerms / SKOS / PROV context
 */

export interface DublinCore {
  identifier: string;
  title: string;
  creator?: string[];
  subject?: string[];
  description?: string;
  publisher?: string;
  contributor?: string[];
  date?: string;
  type?: string;
  format?: string;
  source?: string;
  language?: string;
  relation?: string[];
  coverage?: string;
  rights?: string;
}

export function renderDcXml(dc: DublinCore): string {
  const xml = ['<?xml version="1.0" encoding="UTF-8"?>'];
  xml.push('<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">');
  const add = (tag: string, value?: string | string[]) => {
    if (!value) return;
    const list = Array.isArray(value) ? value : [value];
    for (const v of list) xml.push(`  <dc:${tag}>${xmlEsc(v)}</dc:${tag}>`);
  };
  add("identifier", dc.identifier);
  add("title", dc.title);
  add("creator", dc.creator);
  add("subject", dc.subject);
  add("description", dc.description);
  add("publisher", dc.publisher);
  add("contributor", dc.contributor);
  add("date", dc.date);
  add("type", dc.type);
  add("format", dc.format);
  add("source", dc.source);
  add("language", dc.language);
  add("relation", dc.relation);
  add("coverage", dc.coverage);
  add("rights", dc.rights);
  xml.push("</metadata>");
  return xml.join("\n");
}

export interface JsonLdContext {
  schema?: boolean;
  dcterms?: boolean;
  skos?: boolean;
  prov?: boolean;
}

export function toJsonLd(dc: DublinCore, ctx: JsonLdContext = { schema: true, dcterms: true, skos: true, prov: true }): unknown {
  const context: Record<string, string> = {};
  if (ctx.schema) context.schema = "http://schema.org/";
  if (ctx.dcterms) context.dct = "http://purl.org/dc/terms/";
  if (ctx.skos) context.skos = "http://www.w3.org/2004/02/skos/core#";
  if (ctx.prov) context.prov = "http://www.w3.org/ns/prov#";
  return {
    "@context": context,
    "@id": dc.identifier,
    "@type": dc.type ?? "schema:CreativeWork",
    "schema:name": dc.title,
    "schema:author": dc.creator,
    "schema:about": dc.subject,
    "schema:description": dc.description,
    "schema:publisher": dc.publisher,
    "schema:contributor": dc.contributor,
    "schema:datePublished": dc.date,
    "schema:encodingFormat": dc.format,
    "schema:isBasedOn": dc.source,
    "schema:inLanguage": dc.language,
    "schema:isRelatedTo": dc.relation,
    "schema:spatialCoverage": dc.coverage,
    "schema:license": dc.rights,
  };
}

function xmlEsc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
