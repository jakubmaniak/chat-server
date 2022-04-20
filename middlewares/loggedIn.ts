import { NextFunction, Request, Response } from 'express';

export default function loggedIn(req: Request, res: Response, next: NextFunction) {
    if ('session' in req) next();
    else next(new Error('SESSION_REQUIRED'));
}