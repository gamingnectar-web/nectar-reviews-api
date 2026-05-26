import React, {useEffect, useState} from 'react';
import {
  reactExtension,
  BlockStack,
  Text,
  Button,
  Banner,
  useApi,
  useSettings,
  useBuyerJourneyIntercept,
} from '@shopify/ui-extensions-react/checkout';

export default reactExtension('purchase.checkout.block.render', () => <Extension />);

function Extension() {
  const {app_url: appUrl, shop_domain: shopDomain} = useSettings();
  const {buyerIdentity} = useApi();
  const [wallet, setWallet] = useState(null);
  const [error, setError] = useState('');

  useBuyerJourneyIntercept(() => ({behavior: 'allow'}));

  useEffect(() => {
    async function load() {
      try {
        if (!appUrl || !shopDomain) return;
        const email = buyerIdentity?.email?.current;
        const response = await fetch(`${String(appUrl).replace(/\/$/, '')}/api/loyalty/checkout/wallet?shop=${encodeURIComponent(shopDomain)}`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({email}),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load loyalty wallet.');
        setWallet(data);
      } catch (err) {
        setError(err.message);
      }
    }
    load();
  }, [appUrl, shopDomain, buyerIdentity]);

  if (error) return <Banner status="warning">{error}</Banner>;
  if (!wallet) return <Text>Loading loyalty rewards…</Text>;

  return (
    <BlockStack spacing="base">
      <Text emphasis="bold">Nectar loyalty</Text>
      <Text>{wallet.points || 0} points available</Text>
      <Button disabled={!wallet.points}>Redeem rewards</Button>
    </BlockStack>
  );
}
