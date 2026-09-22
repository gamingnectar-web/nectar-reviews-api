# ELEV8 module routing fix

The dashboard used fuzzy text matching across every button/link on the admin page. Routing is now exact:
- Discounts -> v-discounts
- Loyalty -> v-loyalty
- Marketing Intelligence -> v-marketing-intelligence

Marketing Intelligence is also registered in the browser module shell and exposes an explicit loader.
