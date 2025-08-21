// security.js - shared security helpers & headers
import helmet from 'helmet';


export const isProd = process.env.NODE_ENV === 'production';


export const helmetMw = helmet({
contentSecurityPolicy: {
useDefaults: true,
directives: {
"default-src": ["'self'"],
"script-src": ["'self'"],
"style-src": ["'self'"],
"img-src": ["'self'", 'data:'],
"connect-src": ["'self'"],
"object-src": ["'none'"],
"base-uri": ["'self'"],
"form-action": ["'self'"]
}
},
referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
});


export function noStore(req, res, next) {
res.setHeader('Cache-Control', 'no-store');
next();
}