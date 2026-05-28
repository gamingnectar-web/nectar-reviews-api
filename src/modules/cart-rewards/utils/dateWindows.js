function isWithinWindow(now, start, end){ const t=+new Date(now||Date.now()); return (!start || t>=+new Date(start)) && (!end || t<=+new Date(end)); } module.exports={ isWithinWindow };
