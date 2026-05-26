import React, {useEffect, useState} from 'react';
import {
  reactExtension,
  BlockStack,
  Text,
  Banner,
  ProgressIndicator,
  useSettings,
} from '@shopify/ui-extensions-react/checkout';

export default reactExtension('purchase.checkout.block.render', () => <Extension />);

function Extension() {
  const {app_url: appUrl, shop_domain: shopDomain} = useSettings();
  const [campaign, setCampaign] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        if (!appUrl || !shopDomain) return;
        const response = await fetch(`${String(appUrl).replace(/\/$/, '')}/api/cart-rewards/campaigns?shop=${encodeURIComponent(shopDomain)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load cart rewards.');
        setCampaign((data.campaigns || [])[0] || null);
      } catch (err) {
        setError(err.message);
      }
    }
    load();
  }, [appUrl, shopDomain]);

  if (error) return <Banner status="warning">{error}</Banner>;
  if (!campaign) return null;

  return (
    <BlockStack spacing="base">
      <Text emphasis="bold">{campaign.name || 'Cart rewards'}</Text>
      <ProgressIndicator progress={0.45} />
      <Text>Cart reward progress is available in checkout.</Text>
    </BlockStack>
  );
}
