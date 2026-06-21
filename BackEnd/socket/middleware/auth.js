import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Middleware d'authentification de la socket.
 * On valide le JWT envoyé par le client à la connexion.
 *
 * Pour faciliter les TESTS (ex: Postman), la connexion est autorisée
 * même sans token : on attache simplement userId = null (anonyme).
 * En production tu pourras refuser la connexion si pas de token valide.
 *
 * @param {import('socket.io').Socket} socket
 * @param {(err?: Error) => void} next
 */
export const authenticateSocket = (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
        socket.userId = null; // anonyme (utile pour tester)
        return next();
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        socket.userId = decoded.userId;
        socket.userRole = decoded.role;
        return next();
    } catch (error) {
        // Token présent mais invalide : on refuse
        return next(new Error('Token invalide'));
    }
};
