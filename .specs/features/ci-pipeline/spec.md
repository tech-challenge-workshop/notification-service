# Notification Service CI Pipeline Specification

## Problem Statement

The Notification repository has no automated verification, and its end-to-end suite is the only one in the system that requires a live message broker. Without CI that provides one, the suite is effectively unrunnable outside a developer machine.

CI/CD is an explicit technical requirement of the challenge (RT-5) and no repository has a workflow today. Branch protection on `main` is already active, so the quality gate must exist before it can be required as a status check.

## Goals

- [ ] Run the established quality gates on every pull request targeting `main`.
- [ ] Keep job names stable so branch protection can require them as status checks.
- [ ] Fail the check on any non-zero exit, with no manual step.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
| --- | --- |
| Deployment or registry publication | Belongs to S9a, once manifests exist. |
| Cluster provisioning and environment approval | Belongs to S9a. |
| Changing test, lint, or build behaviour | This slice wires the existing gates; it does not alter them. |
| Coverage thresholds that fail the build | Reporting first; enforcing a number without a baseline blocks work arbitrarily. |

---

## Assumptions & Open Questions

Every ambiguity is resolved or recorded here - nothing is left silently unclear.

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Runner image | `ubuntu-latest` | The services target Linux containers; no Windows or macOS behaviour is exercised. | y |
| Node version | 22 | Matches `node:22-alpine` in the Dockerfile. No `engines` field exists, so the Dockerfile is the only stated source. | y |
| Dependency install | `npm ci` against the committed lockfile | Reproducible, and it fails loudly when the lockfile drifts from `package.json`. | y |
| Triggers | Pull requests targeting `main`, and pushes to `main` | Matches the protected-branch workflow already in use. | y |
| Lint strictness | Zero errors **and** zero warnings | The existing gate already requires this; CI must not be weaker than the local gate. | y |
| Secrets | The quality gate uses none | Nothing in lint, test or build reaches an external service, which keeps runs reproducible for any contributor. | y |
| Broker for the e2e suite | A RabbitMQ service container on the runner | `test/local-integration.e2e-spec.ts:48` connects to `amqp://localhost:5672`, hardcoded, with no skip guard. The suite fails without a broker. | y |
| Broker image | `rabbitmq:4-management-alpine` | Same image already used in `compose.yaml`, so CI and the local loop exercise the same broker. | y |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Quality gate on every pull request ⭐ MVP

**User Story**: As a maintainer, I want lint, tests and build to run automatically on every pull request so that `main` never receives a change that breaks the established gates.

**Why P1**: RT-5 requires CI, and branch protection cannot require a status check that does not exist.

**Acceptance Criteria** (each line is one EARS pattern):

1. WHEN a pull request targets `main` THEN the workflow SHALL run dependency install, lint, unit tests, end-to-end tests, and build. <!-- event-driven -->
2. WHEN any gate step exits non-zero THEN the workflow SHALL fail the check run. <!-- event-driven -->
3. WHEN the workflow installs dependencies THEN it SHALL use `npm ci` against the committed `package-lock.json`. <!-- event-driven -->
4. WHEN the workflow selects a runtime THEN it SHALL use Node 22. <!-- event-driven -->
5. WHEN a commit is pushed to `main` THEN the workflow SHALL run the same gate. <!-- event-driven -->
6. IF lint reports at least one error or warning THEN the workflow SHALL fail. <!-- unwanted-behavior -->
7. The workflow SHALL expose a stable job name so branch protection can require it as a status check. <!-- ubiquitous -->
8. The quality gate SHALL require no repository secret to run. <!-- ubiquitous -->
9. WHILE the end-to-end suite runs, the workflow SHALL provide a RabbitMQ broker reachable at `amqp://localhost:5672`. <!-- state-driven -->
10. WHEN the broker service starts THEN the workflow SHALL wait for it to report healthy before running the end-to-end suite. <!-- event-driven -->

**Independent Test**: Open a pull request with a deliberate lint error and confirm the check fails; remove it and confirm the check passes.

---

### P2: Container image build

**User Story**: As a maintainer, I want the image to be built in CI so that a Dockerfile regression is caught in the pull request rather than at deploy time.

**Why P2**: The gate is useful without it, but a broken image only surfaces later, when it is more expensive.

**Acceptance Criteria**:

1. WHEN the quality gate passes THEN the workflow SHALL build the container image from the repository `Dockerfile`. <!-- event-driven -->
2. IF the image build exits non-zero THEN the workflow SHALL fail the check run. <!-- unwanted-behavior -->
3. The workflow SHALL NOT push the image to any registry. <!-- ubiquitous -->

**Independent Test**: Break a `COPY` path in the Dockerfile and confirm the pull request check fails.

---

### P3: Coverage reporting

**User Story**: As a maintainer, I want a coverage summary published per run so that test coverage is visible before we decide whether to enforce a threshold.

**Why P3**: Reporting informs a future decision; it changes no outcome today.

**Acceptance Criteria**:

1. WHEN unit tests run THEN the workflow SHALL produce a coverage summary retained as a run artifact. <!-- event-driven -->
2. The coverage result SHALL NOT fail the check run. <!-- ubiquitous -->

---

## Edge Cases

- IF `package-lock.json` is out of sync with `package.json` THEN `npm ci` SHALL fail the workflow rather than resolve a different dependency tree.
- IF a newer commit is pushed to the same pull request THEN the superseded run SHALL be cancelled so the reported status reflects the current head.
- IF a job exceeds 15 minutes THEN it SHALL time out and fail rather than occupy a runner indefinitely.
- WHEN the repository contains AppleDouble sidecar files committed from the working volume THEN the workflow SHALL still pass, because a clean checkout contains none.
- IF the RabbitMQ service never reports healthy THEN the workflow SHALL fail with the broker startup as the reported cause, rather than as an opaque connection error inside a test.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| CI-01 | P1: Quality gate | Design | Pending |
| CI-02 | P1: Quality gate | Design | Pending |
| CI-03 | P1: Quality gate | Design | Pending |
| CI-04 | P1: Quality gate | Design | Pending |
| CI-05 | P1: Quality gate | Design | Pending |
| CI-06 | P1: Quality gate | Design | Pending |
| CI-07 | P1: Quality gate | Design | Pending |
| CI-08 | P1: Quality gate | Design | Pending |
| CI-09 | P1: Quality gate | Design | Pending |
| CI-10 | P1: Quality gate | Design | Pending |
| CI-11 | P2: Image build | - | Pending |
| CI-12 | P2: Image build | - | Pending |
| CI-13 | P2: Image build | - | Pending |
| CI-14 | P3: Coverage reporting | - | Pending |
| CI-15 | P3: Coverage reporting | - | Pending |

**ID format:** `CI-[NUMBER]`

**Coverage:** 15 total, 0 mapped to tasks, 15 unmapped (mapping happens in Tasks).

---

## Success Criteria

- [ ] A pull request to `main` reports a passing check produced only by CI.
- [ ] A deliberately broken lint rule, test, or build fails that check.
- [ ] The check name is selectable in the branch protection settings as a required status check.
- [ ] The end-to-end suite that requires a broker passes in CI without any developer-machine setup.
