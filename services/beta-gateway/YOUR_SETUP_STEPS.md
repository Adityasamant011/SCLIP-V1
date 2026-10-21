# Your part before Sclip can take payments

The implementation is built locally. No paid cloud plan has been enabled and your installed Sclip app has not been replaced.

1. Create **Cloudflare**, **Supabase** and **Stripe** accounts. Choose Cloudflare Workers **Free** and Supabase **Free**. Stripe uses transaction fees rather than a fixed subscription for this setup.
2. In Supabase, create a free project. The database script is [001_billing.sql](supabase/001_billing.sql). Enable confirmed email/password accounts and configure an email sender that can reach real customers. An existing verified domain can avoid buying another domain.
3. In Stripe **test mode**, create two monthly USD products/prices: **Bring your AI $5**, **Sclip AI $19**. Finish Stripe's business eligibility setup before live payments.
4. Tell me when those accounts are ready. We can connect and deploy the prepared backend next. Public project URLs and price IDs are safe to share; **do not paste secret API keys/passwords into chat**. Server secrets go directly into Cloudflare's secret fields.
5. After deployment, the app needs only the public gateway URL, followed by a rebuild. We must test a real signup and Stripe test payment before live customers.

**Managed AI:** GLM 5.3 Flash is the selected default. Managed sales stay disabled until there is funded OpenRouter access and a verified spending cap. You can launch the $5 BYOK plan first without funding customers' AI. Stripe payout delays still apply.

**Stock:** your existing personal Pexels/Pixabay keys remain. Shared stock needs owner server keys and the provider's applicable integration approval before enabling it.

The full technical setup and verification instructions are in [README.md](README.md). I can handle those deployment steps with you once the accounts are ready.
