const fs=require('fs'),path=require('path');
const file=path.join(process.cwd(),'extensions','review-widget-extension','blocks','all_reviews_seo_page.liquid');
let src=fs.readFileSync(file,'utf8');
const tag="{{ 'nectar-all-reviews-page-v5.css' | asset_url | stylesheet_tag }}";
if(!src.includes('nectar-all-reviews-page-v5.css')){
  const js="<script src=\"{{ 'nectar-all-reviews-page.js' | asset_url }}\" defer></script>";
  if(!src.includes(js)) throw new Error('All Reviews JS include not found');
  src=src.replace(js,`${tag}\n${js}`);
  fs.writeFileSync(file,src);
  console.log('✓ v5 CSS loaded');
}else console.log('✓ v5 CSS already loaded');
