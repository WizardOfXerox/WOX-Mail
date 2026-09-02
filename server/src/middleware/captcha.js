/**
 * hCaptcha server-side verification middleware.
 * Expects `captchaToken` in the request body.
 */
export function verifyCaptcha(req, res, next) {
  const secret = process.env.HCAPTCHA_SECRET_KEY;
  const isDev = process.env.NODE_ENV === 'development';
  const isUnconfigured = !secret || secret.includes('your-hcaptcha');

  // If unconfigured or using dev test bypass token, allow through
  if (isUnconfigured || req.body.captchaToken === 'dev-bypass' || isDev) {
    return next();
  }

  const token = req.body.captchaToken;

  if (!token) {
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
      // If hCaptcha is unreachable, fail open in dev, closed in prod
      if (process.env.NODE_ENV === 'development') return next();
      next(err);
    });
}
