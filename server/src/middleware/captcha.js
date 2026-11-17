/**
 * hCaptcha server-side verification middleware.
 * Expects `captchaToken` in the request body.
 */
export function verifyCaptcha(req, res, next) {
  const secret = process.env.HCAPTCHA_SECRET_KEY;
  const isProd = process.env.NODE_ENV === 'production';
  const isDevOrTest = !isProd;
  const isUnconfigured = !secret || secret.includes('your-hcaptcha');
  const token = req.body?.captchaToken;

  // Allow bypass/dev-bypass ONLY in non-production environments (development / test)
  if (isDevOrTest) {
    if (
      process.env.NODE_ENV === 'development' ||
      process.env.NODE_ENV === 'test' ||
      isUnconfigured ||
      token === 'dev-bypass'
    ) {
      return next();
    }
  }

  // In production: strictly enforce hCaptcha (never accept dev-bypass)
  if (isUnconfigured) {
    return res.status(503).json({ error: 'CAPTCHA verification is not configured on server' });
  }

  if (!token || typeof token !== 'string' || token === 'dev-bypass') {
    return res.status(400).json({ error: 'CAPTCHA verification required' });
  }

  const params = new URLSearchParams({
    secret,
    response: token,
    remoteip: req.ip,
  });

  fetch('https://api.hcaptcha.com/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    signal: AbortSignal.timeout(8000),
  })
    .then((resp) => resp.json())
    .then((data) => {
      if (data.success) {
        next();
      } else {
        res.status(403).json({
          error: 'CAPTCHA verification failed',
          codes: data['error-codes'],
        });
      }
    })
    .catch((err) => {
      if (!isProd) return next();
      next(err);
    });
}
