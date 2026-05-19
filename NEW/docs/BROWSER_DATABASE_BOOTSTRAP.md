# Browser database bootstrap

Use this when `mongosh` cannot be installed locally.

## 1. Set Render environment variables

Add these variables in Render before deploying:

```txt
MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
DATABASE_BOOTSTRAP_SECRET=make-this-long-random-and-private
DISABLE_DATABASE_BOOTSTRAP=false
```

Optional database names:

```txt
MONGODB_CORE_DB=nectar_core
MONGODB_REVIEWS_DB=nectar_reviews
MONGODB_DISCOUNTS_DB=nectar_discounts
MONGODB_LOYALTY_DB=nectar_loyalty
MONGODB_MESSAGING_DB=nectar_messaging
MONGODB_AUDIT_DB=nectar_audit
```

## 2. Deploy the app

Deploy this codebase to Render.

## 3. Open the setup page

Visit:

```txt
https://YOUR-RENDER-APP.onrender.com/setup/bootstrap
```

Enter:

```txt
DATABASE_BOOTSTRAP_SECRET
```

Then type this exact confirmation:

```txt
CREATE_DATABASES
```

The page creates/updates:

```txt
nectar_core
nectar_reviews
nectar_discounts
nectar_loyalty
nectar_messaging
nectar_audit
```

It also creates indexes, TTL expiry rules, and default Nectar Drops rules.

## 4. Lock the route afterwards

After success, go back to Render and set:

```txt
DISABLE_DATABASE_BOOTSTRAP=true
```

Then redeploy/restart the service.

Leave `DATABASE_BOOTSTRAP_SECRET` in place or rotate it, but keep the route disabled unless you need to run bootstrap again after a future schema change.
