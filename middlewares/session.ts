import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

import env from '../env';


export type SessionPayload = {
    username: string
};

declare global {
    namespace Express {
        export interface Request {
            session?: SessionPayload
        }
    }
}


let cache = new Map();

export default function session(req: Request, res: Response, next: NextFunction) {
    if (req.cookies.sid) {
        let payload;

        if (cache.has(req.cookies.sid)) {
            payload = cache.get(req.cookies.sid);
        }
        else {
            try {
                payload = jwt.verify(req.cookies.sid, env.jwtSecret, { algorithms: ['HS512'] });
                cache.set(req.cookies.sid, payload);   
            }
            catch {
                throw new Error('INVALID_SESSIONID');
            }
        }

        (req as any).session = payload;
    }
    else {
        throw new Error('SESSION_REQUIRED');
    }
    
    next();
}