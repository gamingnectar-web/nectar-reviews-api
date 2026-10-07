const templates = [
  {
    key: 'product-field-change-webhook',
    name: 'Product field changed → webhook',
    description: 'Call an external API only when a selected product field actually changes.',
    trigger: { kind: 'field_changed', resourceType: 'product', fieldPath: 'title' },
    actions: [
      { id: 'http_1', type: 'http_request', label: 'Send webhook', enabled: true, config: {
        method: 'POST',
        url: 'https://example.com/webhook',
        contentType: 'application/json',
        body: '{"productId":"{{resource.id}}","before":"{{change.previous}}","after":"{{change.current}}"}',
        failOn4xx: true,
        failOn5xx: true,
        retry429: true
      } }
    ]
  },
  {
    key: 'restock-notification',
    name: 'Inventory restored → ELEV8 event',
    description: 'Use inventory updates to launch another ELEV8 workflow or notification process.',
    trigger: { kind: 'resource_event', resourceType: 'inventory_level', event: 'inventory_levels/update' },
    conditions: [{ path: 'resource.available', operator: 'gt', value: 0 }],
    actions: [
      { id: 'start_1', type: 'start_workflow', label: 'Start restock workflow', enabled: true, config: {
        workflowName: 'Back in stock',
        specifier: 'restock',
        resourceId: '{{resource.inventory_item_id}}'
      } }
    ]
  },
  {
    key: 'product-seo-ai',
    name: 'Product changed → AI SEO suggestion',
    description: 'Generate a product SEO suggestion after a product update. Does not overwrite Shopify automatically.',
    trigger: { kind: 'resource_event', resourceType: 'product', event: 'products/update' },
    actions: [
      { id: 'ai_1', type: 'ai_generate', label: 'Generate SEO suggestion', enabled: true, config: {
        provider: 'openai',
        credential: 'openai',
        model: 'gpt-5-mini',
        prompt: 'Create a concise ecommerce SEO title and meta description for this product. Return JSON. Product: {{resource}}'
      } }
    ]
  },
  {
    key: 'order-transactional-email',
    name: 'Order event → styled email',
    description: 'Send a styled transactional email from your own SMTP connection.',
    trigger: { kind: 'resource_event', resourceType: 'order', event: 'orders/updated' },
    actions: [
      { id: 'mail_1', type: 'email_styled', label: 'Send email', enabled: true, config: {
        credential: 'smtp-default',
        to: '{{resource.email}}',
        subject: 'Update for {{resource.name}}',
        blocks: [
          { type: 'heading', text: 'Order update' },
          { type: 'text', text: 'Hi {{resource.customer.first_name}}, there is an update to order {{resource.name}}.' },
          { type: 'button', text: 'View your order', url: '{{resource.order_status_url}}' }
        ]
      } }
    ]
  }
];

module.exports = { templates };
