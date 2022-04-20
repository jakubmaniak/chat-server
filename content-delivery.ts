import path from 'path';
import { v4 as uuid } from 'uuid';
import express, { Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import multer from 'multer';

import session from './middlewares/session';
import handle from './routes/helpers/handle';


const app = express();
app.use(cors({ origin: '*' }));
app.use(express.static('public'));
app.use(cookieParser());


const uploadAvatar = multer({
    storage: multer.diskStorage({
        destination: (req, file, next) => {
            next(null, 'public/avatars/');
        },
        filename: (req, file, next) => {
            next(null, uuid() + path.extname(file.originalname))
        }
    })
});

const uploadAttachment = multer({
    storage: multer.diskStorage({
        destination: (req, file, next) => {
            next(null, 'public/attachments/');
        },
        filename: (req, file, next) => {
            next(null, uuid() + path.extname(file.originalname))
        }
    })
});


app.post('/avatar', [session, uploadAvatar.single('file')], handle(async (req: Request, res: Response) => {
    return { fileName: req.file.filename };
}));

app.post('/attachment', [session, uploadAttachment.single('file')], handle(async (req: Request, res: Response) => {
    return { fileName: req.file.filename };
}));

app.listen(3002, () => console.log('Listening...'));