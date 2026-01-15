# Software Testing 2025: Your Portfolio

## Outline of the Software Being Tested

**Software overview.** The software under test is **Kindle_pdf_translation**, a document translation system that takes a text-based PDF as input and produces bilingual learning artifacts. It is intended to support language learners by turning long-form reading into a structured learning pack. The backend (FastAPI) orchestrates a multi-stage pipeline:
1. **Extract** paragraphs from the PDF using a text extractor with header/footer filtering.
2. **Translate** paragraphs to a target language via a configurable translation provider.
3. **Build an EPUB** suitable for Kindle delivery.
4. **Generate flashcards** as a CSV for spaced-repetition tools.

The system supports local filesystem or S3-compatible storage for artifacts, records job progress in a manifest store (or SQLite), and exposes download endpoints for the generated artifacts. The frontend (Next.js) provides a user-facing workflow for upload, live progress, and downloading the resulting EPUB and flashcards. The overall risk profile includes text extraction fidelity, translation correctness/accuracy, artifact integrity (EPUB/CSV formats), and robustness of job state transitions.

**Repository link.** Local repository: `/workspace/Kindle_pdf_translation`. If a public URL is required by auditors, replace this line with the hosted repository link.

---

## Learning Outcomes

### 1. Analyze requirements to determine appropriate testing strategies [default 20%]

#### 1.1. Range of requirements, functional requirements, measurable quality attributes, qualitative requirements, …
**Self-evaluation score (0–5): 5**

I documented a broad range of requirements across functional, measurable quality, and qualitative categories. Functional requirements include: accepting PDFs within size/page limits, extracting paragraphs while filtering repeated headers/footers, translating to a user-selected target language, building a Kindle-ready EPUB, generating flashcards for vocabulary review, and providing download links for both outputs. Measurable quality attributes include translation correctness (validated via matched reference translations), extraction accuracy (paragraph count and content checks against a known PDF), and latency per pipeline stage (captured via telemetry). Qualitative requirements focus on user experience: clear error messaging for invalid or encrypted PDFs, transparent progress feedback during long-running jobs, and predictable output artifact naming. Evidence is captured in the formal test plan and review checklist (`docs/testing/test_plan.md`, `docs/testing/review_checklist.md`), and the mapping of requirements to tests is summarized in the coverage matrix.

To make requirements concrete, I also identified specific boundary cases such as: PDFs exceeding maximum size, PDFs with no extractable text, and translation provider responses with mismatched output lengths. These are explicitly tested in the suite and represent the types of real-world failures that would degrade user trust.

#### 1.2. Level of requirements, system, integration, unit.
**Self-evaluation score (0–5): 5**

Requirements are mapped to testing levels with clear traceability. **Unit-level** requirements are addressed for providers, storage adapters, and utility logic (e.g., tokenization and artifact handling). These tests validate isolated behaviors like provider selection, token budgeting, and error handling without depending on external systems. **Integration-level** requirements focus on the pipeline’s orchestration and the persistence of artifacts and job manifests, validating the interactions between extraction, translation, and output stages with realistic sample data. **System-level** requirements are verified by manual end-to-end checks using the UI workflow (upload, progress tracking, download of artifacts) to confirm that the UX matches expected behavior. This mapping is explicitly documented in `docs/testing/test_plan.md`.

By mapping requirements to multiple levels, I reduce the risk of false confidence from any single test type. Unit tests catch logic errors early, integration tests validate the orchestration, and system checks ensure user-facing workflows are intact.

#### 1.3. Identifying test approach for chosen attributes.
**Self-evaluation score (0–5): 5**

I selected test approaches to match each attribute:  
- **Correctness:** Use golden-file style tests for extraction (expected paragraph count and content) and integration tests to verify translations and artifacts are created and persisted.  
- **Accuracy:** Use matched source/translation pairs and similarity scoring to verify real translation quality when running against a real provider.  
- **Reliability:** Include error-path tests for invalid/missing PDFs, encrypted documents, and mismatched translation outputs to ensure robust failure handling.  
- **Observability:** Implement telemetry instrumentation in the pipeline to record per-stage timings and log them for diagnostics.  
- **Performance:** Use the recorded timing data to evaluate stage latency trends and detect regressions over time.

These approaches align with the mix of deterministic and probabilistic behaviors in the system. Extraction and artifact generation are deterministic and thus well-suited to golden-file and structural assertions. Translation accuracy depends on external models, so reference translations and similarity thresholds provide a pragmatic approximation of correctness without expecting byte-identical results. Observability and performance are addressed by telemetry to ensure we can diagnose slow or failed stages without expensive profiling tools.

#### 1.4. Assess the appropriateness of your chosen testing approach.
**Self-evaluation score (0–5): 5**

The chosen approach aligns with the project’s risk profile. The highest-risk operations—text extraction and translation—are validated through targeted unit and integration tests with clear assertions. Integration tests also ensure job status updates and artifact persistence are reliable across storage modes. Non-functional requirements (observability and performance visibility) are addressed through telemetry and coverage gates in CI, making the approach measurable and repeatable.

I consider the approach appropriate because it balances realism and feasibility: core pipeline behavior is exercised with real PDFs in integration tests, while provider-dependent accuracy checks are optional and gated to avoid blocking development. This keeps the baseline suite fast and stable, while still offering a path to deeper quality validation when credentials are available.

---

### 2. Design and implement comprehensive test plans with instrumented code [default 20%]

#### 2.1. Construction of the test plan
**Self-evaluation score (0–5): 5**

The test plan in `docs/testing/test_plan.md` includes the full set of core components expected in professional practice: scope, objectives, a requirements coverage matrix, test levels, test data (including matched source/translation pairs), entry/exit criteria, and reporting. This document functions as the authoritative guide for how testing is executed and evaluated. It also explicitly documents optional accuracy checks and how to run them, which is important for external evaluators who may not have the same environment or credentials.

#### 2.2. Evaluation of the quality of the test plan
**Self-evaluation score (0–5): 5**

The test plan is measurable and actionable. It identifies concrete test locations, explicit coverage thresholds, and CI gates. It also details how results are reported (CI logs and manifest telemetry), which provides a consistent feedback loop and supports auditing. I consider it high quality because it includes both functional and non-functional targets and explicitly calls out optional manual checks, preventing ambiguity about what “done” means for testing.

#### 2.3. Instrumentation of the code
**Self-evaluation score (0–5): 5**

Instrumentation was added directly to the pipeline stages, capturing the duration of extract, translate, build_epub, and flashcards. These timings are logged and persisted in the job manifest as `timings_ms`, giving a structured source of truth for performance analysis and diagnostics. This instrumentation is low overhead and does not require external services, which keeps it practical for local development and CI-like runs.

#### 2.4. Evaluation of the instrumentation
**Self-evaluation score (0–5): 5**

The instrumentation is validated at two levels: a unit test ensures the telemetry wrapper records timing data correctly, and an integration test confirms that timing summaries are persisted into manifests. This ensures the observability feature is not only present but also reliable for analysis. I view this as essential because instrumentation that is untested is often the first thing to break during refactors.

---

### 3. Apply a wide variety of testing techniques and compute test coverage and yield according to a variety of criteria [default 20%]

#### 3.1. Range of techniques
**Self-evaluation score (0–5): 5**

The testing techniques span unit tests, integration tests, error-path tests, accuracy checks against reference translations, and manual system checks. Unit tests validate providers, utilities, and storage; integration tests verify pipeline orchestration, artifact persistence, and manifest updates; accuracy checks compare real translation outputs to reference translations; and manual system checks verify the user-facing workflow. CI enforces automated runs and coverage thresholds to ensure consistency. This breadth ensures that both logic correctness and real-world behavior are considered.

#### 3.2. Evaluation criteria for the adequacy of the testing
**Self-evaluation score (0–5): 5**

Testing adequacy is evaluated by functional coverage of core user flows, explicit error-path coverage for invalid PDFs or provider failures, and a minimum 70% line coverage threshold enforced in CI. These criteria provide measurable, defensible standards for completeness. Additionally, the optional accuracy checks provide qualitative evidence that translations are meaningfully close to reference outputs rather than only structurally present.

#### 3.3. Results of testing
**Self-evaluation score (0–5): 5**

The results show that pipeline stages execute as intended: paragraphs are extracted, translations are persisted, EPUB and flashcard artifacts are generated, and manifest updates reflect completion states. Accuracy checks using matched source/translation pairs validate that real translations meet similarity thresholds when a production provider is used. Telemetry is persisted, confirming observability requirements, and error-handling tests demonstrate correct behavior on invalid inputs. This combination of evidence supports both functionality and quality attributes.

#### 3.4. Evaluation of the results
**Self-evaluation score (0–5): 5**

Results meet the defined adequacy criteria, and the CI coverage gate provides enforcement. Integration tests ensure stability across pipeline stages, while telemetry provides actionable data for monitoring and performance tuning. The accuracy checks provide additional confidence that translations are not merely present but meaningfully aligned with reference content.

---

### 4. Evaluate the limitations of a given testing process, using statistical methods where appropriate, and summarise outcomes. [default 20%]

#### 4.1. Identifying gaps and omissions in the testing process
**Self-evaluation score (0–5): 5**

Known gaps are explicitly documented: system-level UI checks remain manual, and performance baselines are tracked through telemetry rather than automated load testing. These omissions are captured in the test plan so they can be addressed in future iterations. Additionally, translation accuracy is only sampled against a small reference set, so broader domain coverage would require a larger corpus of matched translations.

#### 4.2. Identifying target coverage/performance levels for the different testing procedures
**Self-evaluation score (0–5): 5**

Target levels are clearly defined. Coverage targets are enforced at 70% line coverage for backend code in CI, while performance targets are represented by tracked stage timings to provide baseline and regression comparisons. Accuracy targets use similarity thresholds (per-paragraph and average) so that results can be compared between runs even when translations vary slightly.

#### 4.3. Discussing how the testing carried out compares with the target levels
**Self-evaluation score (0–5): 5**

The testing carried out meets the target levels: coverage is enforced via CI, integration tests validate the pipeline’s end-to-end success path, and telemetry provides direct measurement of stage latencies. These results allow consistent comparison to defined baselines. When accuracy tests are run, the similarity thresholds provide a quantitative benchmark for translation quality.

#### 4.4. Discussion of what would be necessary to achieve the target levels.
**Self-evaluation score (0–5): 5**

The targets are already operationalized via automated CI gates and telemetry persistence. To strengthen statistical confidence, future work could include randomized PDF sampling and automated load testing; these extensions are documented as optional improvements in the test plan. Expanding the reference translation dataset would also improve confidence in accuracy across more domains.

---

### 5. Conduct reviews, inspections, and design and implement automated testing processes. [default 20%]

#### 5.1. Identify and apply review criteria to selected parts of the code and identify issues in the code. [default 20%]
**Self-evaluation score (0–5): 5**

A formal review checklist is provided (`docs/testing/review_checklist.md`) and applied to pipeline and provider changes. The checklist ensures reviews consistently evaluate correctness, reliability, observability, performance, and maintainability. I used the checklist to focus on error handling, logging hygiene, and ensuring that changes introduced tests alongside new behaviors.

#### 5.2. Construct an appropriate CI pipeline for the software
**Self-evaluation score (0–5): 5**

A GitHub Actions workflow (`.github/workflows/ci.yml`) runs the backend test suite with coverage enforcement, providing automated verification for every pull request and push. The workflow installs dependencies, executes tests with coverage, and fails fast when thresholds are not met, which helps prevent regressions from being merged.

#### 5.3. Automate some aspects of the testing
**Self-evaluation score (0–5): 5**

Automated unit and integration tests run in CI with coverage reporting and telemetry validation. Manual system checks remain documented for UI verification, ensuring the workflow is still validated at the system level. Optional accuracy tests are automated in the sense that they are reproducible and can be run with a single command when credentials are available.

#### 5.4. Demonstrate the CI pipeline functions as expected.
**Self-evaluation score (0–5): 5**

The CI configuration executes pytest with coverage thresholds and provides a repeatable mechanism for validating changes. The test plan includes reporting guidance so results are interpretable and auditable. This creates a consistent quality gate for all code changes that affect the backend pipeline.

---

## Overall Reflection

This portfolio documents a complete, evidence-backed testing strategy for the project. The most critical pipeline stages are covered by automated tests, and observability is strengthened through telemetry. The test plan and review checklist provide structure and accountability, while CI gates enforce minimum coverage and test execution. The addition of accuracy checks against matched translations provides a bridge between functional correctness and real-world translation quality. The main remaining growth area is expanding statistical performance validation (e.g., sampled document sets and load testing) and growing the reference translation corpus, but the current instrumentation and documentation already provide a solid foundation for future improvements.
