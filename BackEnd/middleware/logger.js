const COLORS = {
    reset:   '\x1b[0m',
    dim:     '\x1b[2m',
    green:   '\x1b[32m',
    yellow:  '\x1b[33m',
    red:     '\x1b[31m',
    cyan:    '\x1b[36m',
    magenta: '\x1b[35m',
    white:   '\x1b[37m',
};

const METHOD_COLOR = {
    GET:    COLORS.cyan,
    POST:   COLORS.green,
    PUT:    COLORS.yellow,
    PATCH:  COLORS.yellow,
    DELETE: COLORS.red,
};

const statusColor = (code) => {
    if (code >= 500) return COLORS.red;
    if (code >= 400) return COLORS.yellow;
    if (code >= 300) return COLORS.magenta;
    return COLORS.green;
};

/**
 * Middleware de logging HTTP.
 * Affiche : méthode  chemin  code  durée  (userId si authentifié)
 *
 * Format :
 *   [http] POST /auth/connexion → 200  12ms
 *   [http] GET  /users/alice    → 404  3ms   (userId: 42)
 */
export const httpLogger = (req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
        const ms      = Date.now() - start;
        const method  = req.method.padEnd(6);
        const path    = req.originalUrl;
        const code    = res.statusCode;
        const user    = req.userId ? `${COLORS.dim}(userId: ${req.userId})${COLORS.reset}` : '';

        const mColor  = METHOD_COLOR[req.method] ?? COLORS.white;
        const sColor  = statusColor(code);

        console.log(
            `[http] ${mColor}${method}${COLORS.reset} ${path.padEnd(35)} ${COLORS.dim}→${COLORS.reset} ${sColor}${code}${COLORS.reset}  ${COLORS.dim}${ms}ms${COLORS.reset}  ${user}`
        );
    });

    next();
};
