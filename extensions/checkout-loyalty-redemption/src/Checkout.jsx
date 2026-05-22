import {
  render,
  BlockStack,
  Button,
  Banner,
  Text,
  TextField,
  InlineLayout,
  useApi,
  useSettings,
  useApplyDiscountCodeChange,
} from '@shopify/ui-extensions-react/checkout';
import {useEffect, useMemo, useState} from 'preact/hooks';

render('purchase.checkout.block.render', () => <LoyaltyCheckoutRedemption />);

function LoyaltyCheckoutRedemption() {
  const api = useApi();
  const settings = useSettings();
  const applyDiscountCodeChange = useApplyDiscountCodeChange();
  const [wallet, setWallet] = useState(null);
  const [pointsToRedeem, setPointsToRedeem] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const appUrl = String(settings.app_url || '').replace(/\/$/, '');
  const shopDomain = String(settings.shop_domain || '').trim();
  const customerId = api.buyerIdentity?.customer?.current?.id || '';
  const email = api.buyerIdentity?.email?.current || '';
  const checkoutToken = api.checkoutToken?.current || '';
  const currencyCode = api.cost?.totalAmount?.current?.currencyCode || '';
  const cartTotal = Number(api.cost?.totalAmount?.current?.amount || 0);

  const canLoad = useMemo(() => Boolean(appUrl && shopDomain), [appUrl, shopDomain]);

  useEffect(() => {
    let cancelled = false;
    async function loadWallet() {
      if (!canLoad) return;
      try {
        const res = await fetch(`${appUrl}/api/loyalty/checkout/wallet`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({shopDomain, customerId, email}),
        });
        const data = await res.json();
        if (!cancelled) {
          setWallet(data);
          const max = Math.min(Number(data.availablePoints || 0), Number(data.checkoutBeta?.maximumPointsPerCheckout || data.availablePoints || 0));
          setPointsToRedeem(max ? String(max) : '');
        }
      } catch (error) {
        if (!cancelled) setWallet({enabled: false, reason: 'network_error'});
      }
    }
    loadWallet();
    return () => { cancelled = true; };
  }, [appUrl, shopDomain, customerId, email, canLoad]);

  if (!canLoad) return null;
  if (!wallet) return <Banner status="info"><Text>Checking rewards…</Text></Banner>;
  if (!wallet.enabled) return null;
  if (!wallet.rewards?.length || Number(wallet.availablePoints || 0) < Number(wallet.checkoutBeta?.minimumPointsToShow || 1)) return null;

  const reward = wallet.rewards.find((item) => item.canRedeem) || wallet.rewards[0];
  const maxRedeem = Math.min(Number(wallet.availablePoints || 0), Number(wallet.checkoutBeta?.maximumPointsPerCheckout || wallet.availablePoints || 0));
  const pointValueMinorUnits = Number(wallet.checkoutBeta?.pointValueMinorUnits || 1);
  const selectedPoints = Math.max(0, Math.min(Number(pointsToRedeem || 0), maxRedeem));
  const approxDiscount = selectedPoints * pointValueMinorUnits / 100;

  async function redeem() {
    if (!selectedPoints) {
      setMessage(`Enter how many ${wallet.pointName} to redeem.`);
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch(`${appUrl}/api/loyalty/checkout/redeem`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({shopDomain, customerId, email, rewardId: reward.id, pointsToRedeem: selectedPoints, cartTotal, currencyCode, checkoutToken}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not redeem points.');
      if (data.discountCode) {
        const result = await applyDiscountCodeChange({type: 'addDiscountCode', code: data.discountCode});
        if (result?.type === 'error') throw new Error(result.message || 'Discount code could not be applied.');
        setMessage(`Applied ${selectedPoints} ${wallet.pointName}.`);
      } else {
        setMessage('Reward reserved. Native checkout discount code issuing is not enabled for this beta yet.');
      }
      setWallet(data.wallet || wallet);
    } catch (error) {
      setMessage(error.message || 'Could not redeem points.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <BlockStack spacing="base">
      <Banner status="info">
        <BlockStack spacing="tight">
          <Text emphasis="bold">{wallet.checkoutBeta?.betaLabel || 'Use your points at checkout'}</Text>
          <Text>You have {wallet.availablePoints} {wallet.pointName}. About {currencyCode} {approxDiscount.toFixed(2)} will be reserved when applied.</Text>
        </BlockStack>
      </Banner>
      <InlineLayout columns={['fill', 'auto']} spacing="base">
        <TextField
          label={`${wallet.pointName} to redeem`}
          value={pointsToRedeem}
          onChange={(value) => setPointsToRedeem(String(value).replace(/[^0-9]/g, ''))}
          helpText={`Maximum ${maxRedeem} ${wallet.pointName}`}
        />
        <Button disabled={busy || !selectedPoints} onPress={redeem}>{busy ? 'Applying…' : 'Apply'}</Button>
      </InlineLayout>
      {message ? <Text>{message}</Text> : null}
    </BlockStack>
  );
}
