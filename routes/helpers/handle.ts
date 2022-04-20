import { NextFunction, Request, Response } from 'express';

const handle = (handler) => {
    return (req: Request, res: Response, next: NextFunction) => {
        handler(req, res, next)
            .then((results) => {
                res.json({ error: false, data: results ?? null });
            })
            .catch((err) => {
                console.error(err);
                res.json({ error: true, code: err.message });
            });
    };
};

export default handle;