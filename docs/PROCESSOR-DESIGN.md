# File Processor Design

## Overview

A low-volume ingestion pipeline that processes uploaded files, validates them, and extracts structured information. Files are uploaded to S3 (existing flow); this design covers the processing side only.

**Volume**: Daily or a few per day at most.

---

## Trigger

When a file lands in the upload prefix (`uploads/userdata/pdftestresults/`), something must kick off processing.

**Options**:

| Option | Pros | Cons |
|--------|------|------|
| **S3 Event → Lambda** | Simple, serverless, scales to zero | Lambda timeout (15 min) for heavy parsing; cold starts |
| **S3 Event → SQS → Lambda** | Decoupling, retries, backpressure | Extra component |
| **S3 Event → Step Functions** | Orchestration, visibility, long-running | More complex for low volume |

**Recommendation**: S3 Event → Lambda. For low volume and PDF parsing, Lambda is sufficient. If parsing ever exceeds ~10 minutes, we can move to Step Functions or ECS.

**Flow**: S3 `ObjectCreated:*` on the upload prefix → invoke processor Lambda with bucket + key.

---

## Validation

Before processing, verify the file is a PDF:

1. **Content-Type / extension**: Quick check; not sufficient alone (user could rename .txt to .pdf).
2. **Magic bytes**: PDF files start with `%PDF-` (hex: `25 50 44 46 2D`). Read first few bytes from S3 to confirm.
3. **Optional**: Use a lightweight PDF library to attempt parsing; failure = invalid.

**Recommendation**: Magic bytes check first (fast, no dependency). If that passes, proceed to extraction; extraction failure can also indicate a corrupted or non-PDF file.

---

## Content Types & Extraction

### Supported formats (future)

- **PDF** (first)
- **JSON** (later): Garmin, other sources — known schemas per source

### PDF content types (MyChart blood tests)

| Type | Description | Output shape |
|------|-------------|--------------|
| **Trend data** | Historical data, multiple data points over time | Time series: `(name, timestamp, value)` |
| **Test data** | Single test result, multiple measurements | Time series: `(name, timestamp, value)` — timestamp may be single for all |

Both reduce to: **time series of named values** (e.g., H1b over time).

### Extraction pipeline

```
PDF bytes → Parse (e.g. pdf-parse, pdfjs) → Extract text/tables
         → Content-type classifier (trend vs test)
         → Parser per type (MyChart trend, MyChart test)
         → Normalized output: [{ name, timestamp, value }, ...]
```

**Schema (deferred)**: Exact field names and structure TBD. For now, assume:
- `name`: measurement identifier (e.g. "H1b", "Glucose")
- `timestamp`: ISO 8601 or epoch
- `value`: number or string

---

## Output

Where does extracted data go?

**Options**:

| Option | Pros | Cons |
|
| **S3 (JSON/Parquet)** | Simple, cheap, queryable with Athena | Need to define prefix/schema |
| **DynamoDB** | Query by name, time range | Cost at scale; schema design |
| **Timestream** | Built for time series | Extra service, may be overkill for low volume |

**Recommendation**: Start with **S3**. Write extracted JSON (or Parquet) to a prefix like `processed/{content-type}/{date}/{file-id}.json`. Enables:
- Auditing
- Later Athena/Glue for analytics
- Easy migration to a DB if needed

---

## Architecture Sketch

```
[Upload] → S3 upload prefix
              ↓
         S3 Event (ObjectCreated)
              ↓
         Processor Lambda
              ├── Validate (magic bytes → PDF?)
              ├── Parse PDF
              ├── Classify (trend vs test)
              ├── Extract (MyChart parser)
              └── Write → S3 processed prefix
```

---

## Implementation Phases

1. **Phase 1**: S3 trigger + Lambda stub that validates PDF (magic bytes) and logs. No extraction yet.
2. **Phase 2**: PDF parsing (text extraction). Dump raw text to S3 for inspection.
3. **Phase 3**: MyChart content-type detection (trend vs test) — heuristic or pattern-based.
4. **Phase 4**: MyChart parsers for trend and test; output normalized time series to S3.
5. **Phase 5** (later): JSON ingestion path; schema registry per source.

---

## Open Questions

- [ ] Exact MyChart PDF layout — need sample PDFs to design parsers.
- [ ] Idempotency: same file uploaded twice — overwrite, skip, or version?
- [ ] Error handling: invalid/corrupt PDF → DLQ? Dead-letter prefix in S3?
- [ ] Metadata: retain original filename, upload timestamp, user/source?
