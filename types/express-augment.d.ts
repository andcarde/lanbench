import 'express';

declare module 'express-serve-static-core' {
    interface Request {
        session?: {
            user?: {
                id?: number;
                userId?: number;
                email?: string;
                role?: string;
                [key: string]: unknown;
            };
            destroy?(callback: (err?: Error) => void): void;
            [key: string]: unknown;
        };
    }
}

export {};
