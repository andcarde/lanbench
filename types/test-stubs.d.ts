/**
 * Ambient type definitions for the hand-written test doubles used across the
 * unit/integration suites.
 *
 * These intentionally type method parameters loosely (mostly `any`): their job
 * is to document each stub's method surface and to satisfy `noImplicitAny` on
 * stub parameters under `checkJs` — not to re-derive the production contracts
 * (the real interfaces live with their modules). Reference them from a test
 * with a JSDoc annotation, e.g. `/** @type {ReviewsRepoStub} *\/`.
 */

/** Reviews repository stub — see tests/unit/reviews/reviews-service.test.js. */
interface ReviewsRepoStub {
    expireStaleReviews(when?: any): Promise<any>;
    findActiveReviewByReviewer(args: any): Promise<any>;
    findReviewById(reviewId: any): Promise<any>;
    findReviewableEntries(args: any): Promise<any>;
    createReview(args: any): Promise<any>;
    updateReviewStatus(args: any): Promise<any>;
    updateReviewProgress(args: any): Promise<any>;
    upsertDecision(args: any): Promise<any>;
    findDecisionsByReview(args: any): Promise<any>;
    findAnnotatedSentenceIndexes(args: any): Promise<any>;
    createComment(payload: any): Promise<any>;
    findCommentsByReview(args: any): Promise<any>;
    findCompletedReviewsForAnnotator(): Promise<any>;
}

/** Minimal Prisma client stub with a loosely-typed `$transaction`. */
interface PrismaStub {
    $transaction(fn: (tx: any) => any): Promise<any>;
    [model: string]: any;
}

/** A single Prisma model delegate stub (`upsert`, `findMany`, …) taking `args`. */
interface PrismaDelegateStub {
    [op: string]: (...args: any[]) => any;
}

/** Dataset LLM-credentials repository stub (see the credentials service tests). */
interface CredentialsRepoStub {
    upsertByProvider(payload: any): Promise<any>;
    listByDataset(datasetId?: any): Promise<any>;
    findActiveByDataset(datasetId?: any): Promise<any>;
    findByProvider(args: any): Promise<any>;
    setActive(args: any): Promise<any>;
    deleteByProvider(args: any): Promise<any>;
    findDatasetLlmMode(datasetId?: any): Promise<any>;
}

/**
 * Controller response capture — the `{ status, json }`-style spy used by the
 * controller unit tests to record the `(code, payload)` a handler emits.
 */
interface ResponseSpy {
    status(code: any): ResponseSpy;
    json(payload: any): ResponseSpy;
    send?(payload?: any): ResponseSpy;
    [key: string]: any;
}
