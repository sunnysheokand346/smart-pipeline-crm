import { InterstitialAd, AdEventType, TestIds } from 'react-native-google-mobile-ads';
import { Platform } from 'react-native';

// Test Ad unit
const AD_UNIT_ID = Platform.select({
  ios: TestIds.INTERSTITIAL,
  android: TestIds.INTERSTITIAL,
});

const interstitialAd = InterstitialAd.createForAdRequest(AD_UNIT_ID, {
  requestNonPersonalizedAdsOnly: true,
});

let adLoaded = false;

// ✅ Attach listeners properly
interstitialAd.addAdEventListener(AdEventType.LOADED, () => {
  adLoaded = true;
  console.log('Interstitial ad loaded');
});

interstitialAd.addAdEventListener(AdEventType.CLOSED, () => {
  adLoaded = false;
  console.log('Interstitial ad closed, preloading next ad');
  interstitialAd.load(); // Preload next ad
});

interstitialAd.addAdEventListener(AdEventType.ERROR, (error) => {
  console.log('Interstitial ad error:', error);
});

// Load initially
interstitialAd.load();

// Function to show ad
export const showInterstitialAd = () => {
  if (adLoaded) interstitialAd.show();
  else interstitialAd.load();
};
