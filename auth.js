// auth.js - login, logout, JWT cookie, CSRF integration
import fs from 'fs';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { body, validationResult } from 'express-validator';
import csrf from 'csurf';
import { isProd } from './security.js';


const COOKIE_NAME = process.env.COOKIE_NAME || 'auth';


function readSecret(name, envName) {
try {
return fs.readFileSync(`/run/secrets/${name}`, 'utf8').trim();
} catch (_) {
return (process.env[envName] || '').trim();
}
}


const ADMIN_USER = readSecret('admin_user', 'ADMIN_USER');
const PASSWORD_HASH = readSecret('password_hash', 'PASSWORD_HASH');
const JWT_SECRET = readSecret('jwt_secret', 'JWT_SECRET') || cryptoRandom(48);


function cryptoRandom(len) {
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
let out = '';
while (out.length < len) out += alphabet[Math.floor(Math.random() * alphabet.length)];
return out;
}


export const cookies = cookieParser();


export const csrfMw = csrf({
cookie: {
key: '_csrf',
httpOnly: true,
sameSite: 'strict',
secure: isProd,
path: '/'
}
});


export const loginLimiter = rateLimit({
windowMs: Number(process.env.RATE_WINDOW_MS || 900000),
max: Number(process.env.LOGIN_RATE_MAX || 10),
standardHeaders: true,
legacyHeaders: false
});


export const apiLimiter = rateLimit({
windowMs: Number(process.env.RATE_WINDOW_MS || 900000),
max: Number(process.env.RATE_MAX || 100),
standardHeaders: true,
legacyHeaders: false
});


const cookieOpts = {
httpOnly: true,
secure: isProd,
sameSite: 'strict',
path: '/',
maxAge: 1000 * 60 * 60 * 8 // 8h
};


export const validators = [
body('username').isString().trim().notEmpty(),
body('password').isString().isLength({ min: 8 })
];


export async function login(req, res) {
const errors = validationResult(req);
if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });


}