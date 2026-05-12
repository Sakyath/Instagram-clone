import { Request, Response, NextFunction } from 'express';
import { JwtPayload } from '../types';
export interface AuthRequest extends Request {
    user?: JwtPayload;
}
export declare function generateToken(userId: string, username: string): string;
export declare function verifyToken(token: string): JwtPayload | null;
export declare function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void;
export declare function optionalAuthMiddleware(req: AuthRequest, res: Response, next: NextFunction): void;
//# sourceMappingURL=auth.d.ts.map