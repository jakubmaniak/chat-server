import axios from 'axios';

import env from './env';


export default async function translate(sourceText: string, sourceLang: string, targetLang: string): Promise<string> {
    const langs = ['cs', 'fr', 'en', 'es', 'de', 'it', 'pl', 'ru', 'sk'];

    if (!['auto', ...langs].includes(sourceLang)) throw new Error('INVALID_SOURCE_LANG');
    if (!langs.includes(targetLang)) throw new Error('INVALID_TARGET_LANG');

    let contentBody = `text=${encodeURI(sourceText)}&target_lang=${targetLang}`;

    if (sourceLang != 'auto') {
        contentBody += `&source_lang=${sourceLang}`;
    }

    try {
        const res = await axios.post('https://api-free.deepl.com/v2/translate', contentBody, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'DeepL-Auth-Key ' + env.deeplAuthKey
            }
        });

        return res.data.translations[0].text;
    }
    catch (err) {
        throw new Error('TRANSLATOR_ERROR');
    }
}