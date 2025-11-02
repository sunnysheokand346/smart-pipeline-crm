import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Alert, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator, DrawerContentScrollView, DrawerItemList, DrawerItem } from '@react-navigation/drawer';
import { createStackNavigator } from '@react-navigation/stack';
import { Provider as PaperProvider, Text } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTransientSignIn } from './utils/transientSignIn';

// ✅ Notifications
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import NotificationService from './utils/NotificationService'; // ✅ Correct import

import LeadForm from './components/LeadForm';
import LeadList from './components/LeadList';
import Dashboard from './components/Dashboard';
import SignUp from './components/SignUp';
import SignIn from './components/SignIn';
import OTPConfirmation from './components/OTPConfirmation';
import LeadsPool from './components/LeadsPool';
import AddLeadOptions from './components/AddLeadOptions';
import UploadExcel from './components/UploadExcel';
import DuplicateLeadsScreen from './components/DuplicateLeadsScreen';
import ProfileScreen from './components/ProfileScreen';
import TeamManagementScreen from './components/TeamManagement';
import SupportScreen from './components/SupportScreen';
import { UserProvider, useUser } from './context/UserContext';

import { InterstitialAd, AdEventType, TestIds } from 'react-native-google-mobile-ads';

// ------------------- GLOBAL INTERSTITIAL AD -------------------
const AD_UNIT_ID = Platform.select({
  ios: TestIds.INTERSTITIAL,
  android: TestIds.INTERSTITIAL,
});
const interstitialAd = InterstitialAd.createForAdRequest(AD_UNIT_ID, {
  requestNonPersonalizedAdsOnly: true,
});

// ------------------- NOTIFICATION HANDLER -------------------
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ------------------- NAVIGATION -------------------
const Stack = createStackNavigator();
const Drawer = createDrawerNavigator();

function RootNavigator() {
  const { user, loading, logout } = useUser();

  useEffect(() => {
    let mounted = true;
    const checkRemember = async () => {
      if (loading) return;
      try {
        const transientInMemory = getTransientSignIn && getTransientSignIn();
        const transientStorage = await AsyncStorage.getItem('transientSignIn');
        const transient = transientInMemory || transientStorage === 'true';
        const remember = await AsyncStorage.getItem('rememberMe');

        if (mounted && user && remember !== 'true' && !transient) {
          await logout();
        }
      } catch (error) {
        console.error('Error checking rememberMe:', error);
      }
    };
    checkRemember();
    return () => {
      mounted = false;
    };
  }, [loading, user, logout]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 10 }}>Loading App...</Text>
      </View>
    );
  }

  return user ? <MainAppStack /> : <AuthStack />;
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SignIn" component={SignIn} />
      <Stack.Screen name="SignUp" component={SignUp} />
      <Stack.Screen name="OTP Confirmation" component={OTPConfirmation} />
    </Stack.Navigator>
  );
}

function MainAppStack() {
  const { profile } = useUser();
  const isManager = (profile?.role || '').trim().toLowerCase() === 'manager';

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Drawer" component={DrawerNavigator} />
      <Stack.Screen name="Dashboard" component={Dashboard} />
      <Stack.Screen name="All Leads" component={LeadList} />
      <Stack.Screen name="Add Lead Form" component={LeadForm} />
      <Stack.Screen name="Upload Excel" component={UploadExcel} />
      <Stack.Screen name="Leads Pool" component={LeadsPool} />
      <Stack.Screen name="Add New Leads" component={AddLeadOptions} />
      <Stack.Screen name="Manage Team" component={TeamManagementScreen} />
      <Stack.Screen name="Support" component={SupportScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
    </Stack.Navigator>
  );
}

function DrawerNavigator() {
  const { profile } = useUser();
  const isManager = (profile?.role || '').trim().toLowerCase() === 'manager';

  return (
    <Drawer.Navigator
      initialRouteName="Dashboard"
      drawerContent={(props) => <CustomDrawerContent {...props} />}
    >
      <Drawer.Screen name="Dashboard" component={Dashboard} />
      <Drawer.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          drawerLabelStyle: { color: '#D97706', fontWeight: 'bold' },
          drawerIcon: ({ size }) => <MaterialIcons name="account-circle" color="#D97706" size={size} />,
        }}
      />
      {isManager && <Drawer.Screen name="Leads Pool" component={LeadsPool} />}
      <Drawer.Screen
        name={isManager ? 'Add New Leads' : 'Add Lead'}
        component={isManager ? AddLeadOptions : LeadForm}
      />
      <Drawer.Screen name="All Leads" component={LeadList} />
      {isManager && <Drawer.Screen name="Manage Team" component={TeamManagementScreen} />}
    </Drawer.Navigator>
  );
}

function CustomDrawerContent(props) {
  const { logout, profile } = useUser();
  const isManager = (profile?.role || '').trim().toLowerCase() === 'manager';

  const handleLogout = async () => {
    try {
      await AsyncStorage.removeItem('rememberMe');
      await logout();
    } catch (error) {
      console.error('Logout Error:', error.message);
      Alert.alert('Logout Failed', 'An error occurred while signing out.');
    }
  };

  const handleSupportTeam = () => {
    props.navigation.navigate('Support');
  };

  return (
    <DrawerContentScrollView {...props} contentContainerStyle={{ flex: 1, justifyContent: 'space-between' }}>
      <View>
        <DrawerItemList {...props} />
      </View>

      <View style={{ paddingVertical: 10 }}>
        {isManager && (
          <DrawerItem
            label="Support Team"
            onPress={handleSupportTeam}
            icon={({ size }) => <MaterialIcons name="support" color="#007bff" size={size} />}
            style={{ marginHorizontal: 10, borderRadius: 8, marginBottom: 10 }}
          />
        )}
        <DrawerItem
          label="Logout"
          labelStyle={{ color: 'red', fontWeight: 'bold' }}
          onPress={handleLogout}
          style={{ borderTopWidth: 1, borderColor: '#eee', marginHorizontal: 10, borderRadius: 8 }}
        />
      </View>
    </DrawerContentScrollView>
  );
}

// ------------------- APP -------------------
export default function App() {
  const [adLoaded, setAdLoaded] = useState(false);

  // ✅ Initialize Push Notifications
  useEffect(() => {
    NotificationService.initialize(); // register + permission + token

    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      console.log('📩 Notification Received:', notification);
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('📨 Notification Clicked:', response);
    });

    return () => {
      subscription.remove();
      responseSubscription.remove();
    };
  }, []);

  // ------------------- Ad Logic -------------------
  useEffect(() => {
    const loadedListener = interstitialAd.addAdEventListener(AdEventType.LOADED, () => setAdLoaded(true));
    const closedListener = interstitialAd.addAdEventListener(AdEventType.CLOSED, () => {
      setAdLoaded(false);
      interstitialAd.load();
    });
    const errorListener = interstitialAd.addAdEventListener(AdEventType.ERROR, () => setAdLoaded(false));

    interstitialAd.load();

    // Show ad every 20 minutes
    const interval = setInterval(() => {
      if (adLoaded) {
        interstitialAd.show();
        setAdLoaded(false);
      } else {
        interstitialAd.load();
      }
    }, 20 * 60 * 1000);

    return () => {
      loadedListener();
      closedListener();
      errorListener();
      clearInterval(interval);
    };
  }, [adLoaded]);

  return (
    <PaperProvider>
      <UserProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </UserProvider>
    </PaperProvider>
  );
}
