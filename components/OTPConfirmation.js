// components/OTPConfirmation.js
import React, { useState, useRef, useEffect } from "react";
import { View, Text, TextInput, Alert, ActivityIndicator } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import LottieView from "lottie-react-native";
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "../supabaseClient";
import { Button } from "react-native-paper";

const OTPConfirmation = () => {
  const navigation = useNavigation();
  const route = useRoute();

  const { email, name, finalUsername, role, managerId } = route.params || {}; // ✅ from SignUp (managerId for telecallers)

  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [resendMessage, setResendMessage] = useState("");

  const animationRef = useRef(null);

  // Countdown timer for resend OTP
  useEffect(() => {
    let timer;
    if (cooldown > 0) {
      timer = setInterval(() => setCooldown((prev) => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [cooldown]);

  // ✅ Handle OTP Verification
  const handleVerifyOTP = async () => {
    if (!otp || otp.length !== 6) {
      Alert.alert("Error", "Please enter a valid 6-digit OTP.");
      return;
    }

    setLoading(true);
    try {
      console.log("🔐 Verifying OTP for:", email);

      // First verify the OTP
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: "signup",
      });

      if (error) {
        console.error("❌ OTP Verification Failed:", error.message);
        Alert.alert("Invalid OTP", error.message || "Please try again.");
        return;
      }

      console.log("✅ OTP Verified Successfully:", data);

      // Get the user ID from the verified user (explicitly confirm session)
      const userId = data?.user?.id;
      if (!userId) {
        // Try to read session as a fallback
        const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
        console.log('OTPConfirmation: fallback getSession', { sessionData, sessionErr });
        const sessUserId = sessionData?.session?.user?.id;
        if (!sessUserId) {
          Alert.alert('Error', 'User ID missing after verification.');
          return;
        }
      }

      // Confirm the current session (important for RLS-authorized requests)
      let { data: sessionInfo, error: getSessionError } = await supabase.auth.getSession();
      console.log('OTPConfirmation: current session info', { sessionInfo, getSessionError });

      // If verifyOtp returned a session but the client didn't persist it yet, set it manually.
      // data.session (from verifyOtp) contains access_token and refresh_token.
      if ((!sessionInfo || !sessionInfo.session) && data?.session?.access_token) {
        try {
          console.log('OTPConfirmation: setting session from verifyOtp tokens');
          const { data: setRes, error: setErr } = await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          });
          console.log('OTPConfirmation: setSession result', { setRes, setErr });
          // re-read sessionInfo after setting
          const { data: newSessionInfo, error: newSessionErr } = await supabase.auth.getSession();
          sessionInfo = newSessionInfo;
          getSessionError = newSessionErr;
          console.log('OTPConfirmation: session info after setSession', { sessionInfo, getSessionError });
        } catch (setErr) {
          console.error('OTPConfirmation: setSession threw', setErr);
        }
      }

      // Sometimes the session isn't immediately available to client after verifyOtp.
      // Wait briefly for a session to appear (up to 5s) before attempting the RLS-protected insert.
      const waitForSession = async (timeout = 5000, interval = 300) => {
        const start = Date.now();
        // if we already have a session, return it
        if (sessionInfo?.session) return sessionInfo.session;
        while (Date.now() - start < timeout) {
          const { data: s } = await supabase.auth.getSession();
          if (s?.session && s.session.user?.id) {
            return s.session;
          }
          await new Promise((res) => setTimeout(res, interval));
        }
        return null;
      };

      const session = await waitForSession(5000, 300);
      console.log('OTPConfirmation: waited session result', { session });

      // Create or update profile using upsert (array form) and log full error object
      const finalUserId = userId || session?.user?.id || sessionInfo?.session?.user?.id;
      console.log('OTPConfirmation: finalUserId used for profile', { finalUserId });

      const profilePayload = {
        id: finalUserId,
        name: name || '',
        username: finalUsername?.toLowerCase(),
        role: role || 'telecaller',
        email: email?.toLowerCase(),
        // include manager relationship when present (use snake_case if DB column is manager_id)
        ...(managerId ? { manager_id: managerId } : {}),
        updated_at: new Date().toISOString(),
      };

      console.log('OTPConfirmation: inserting profile payload', profilePayload);

      // If the supabase client has a session, use client upsert. Otherwise fallback to REST insert using access_token
      let profileData = null;
      let profileError = null;

      const hasClientSession = !!(sessionInfo?.session || session?.access_token || session?.user);

      if (hasClientSession) {
        const res = await supabase.from('profiles').upsert([profilePayload], { onConflict: 'id', returning: 'minimal' });
        profileData = res.data;
        profileError = res.error;
      } else if (data?.session?.access_token) {
        // REST fallback: call Supabase REST endpoint with the access token returned by verifyOtp
        try {
          const token = data.session.access_token;
          // Use PostgREST on_conflict to perform an upsert-like insert (avoid duplicate primary key)
          const resp = await fetch(`${SUPABASE_URL}/rest/v1/profiles?on_conflict=id`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              Authorization: `Bearer ${token}`,
              apikey: SUPABASE_ANON_KEY,
              // Ask PostgREST to merge duplicates (upsert) and return the inserted/updated row
              Prefer: 'resolution=merge-duplicates,return=representation',
            },
            body: JSON.stringify(profilePayload),
          });

          const json = await resp.json().catch(() => null);
          if (!resp.ok) {
            // If it's a duplicate primary key error, try to PATCH/update the existing row instead
            if (resp.status === 409) {
              try {
                const patchResp = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${finalUserId}`, {
                  method: 'PATCH',
                  headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    Authorization: `Bearer ${token}`,
                    apikey: SUPABASE_ANON_KEY,
                    Prefer: 'return=representation',
                  },
                  body: JSON.stringify(profilePayload),
                });
                const patchJson = await patchResp.json().catch(() => null);
                if (!patchResp.ok) {
                  profileError = { message: patchJson?.message || `HTTP ${patchResp.status}` };
                } else {
                  profileData = patchJson;
                }
              } catch (patchErr) {
                profileError = patchErr;
              }
            } else {
              profileError = { message: json?.message || `HTTP ${resp.status}` };
            }
          } else {
            profileData = json;
          }
        } catch (err) {
          profileError = err;
        }
      } else {
        profileError = { message: 'No authenticated session and no access token available' };
      }

      if (profileError) {
        console.error('❌ Profile creation failed:', profileError);
        if ((profileError.message || '').toString().toLowerCase().includes('row-level security') || profileError.code === '42501') {
          Alert.alert(
            'Profile Error (RLS)',
            'Insert blocked by database row-level security. Please confirm your policies allow auth.uid() = id and that the request is authenticated.'
          );
        } else {
          Alert.alert('Profile Error', profileError.message || 'Failed to create profile. Please contact support.');
        }
        return;
      }

      console.log('✅ Profile created successfully', { profileData });
      setSuccess(true);
      animationRef.current?.play();

      // Sign out the user to ensure clean state for sign in
      await supabase.auth.signOut();

      // Redirect to SignIn after success animation
      setTimeout(() => {
        navigation.reset({
          index: 0,
          routes: [
            {
              name: "SignIn",
              params: {
                fromSignup: true,
                email: email.toLowerCase(),
                message: "Account created successfully! Please sign in.",
              },
            },
          ],
        });
      }, 2000);
    } catch (e) {
      console.error("❌ Verification Error:", e.message);
      Alert.alert("Error", "Failed to verify OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // 🔄 Handle Resend OTP
  const handleResendOTP = async () => {
    if (cooldown > 0) return;

    setResending(true);
    setResendMessage("");
    console.log("🔄 Resending OTP to:", email);

    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
      });

      if (error) {
        console.error("❌ Error resending OTP:", error.message);
        setResendMessage(
          error.message.toLowerCase().includes("rate limit")
            ? "Too many requests. Please wait."
            : error.message
        );
        return;
      }

      console.log("✅ OTP resend successful");
      setCooldown(60);
      setResendMessage("OTP sent again. Please check your email.");
    } catch (e) {
      console.error("❌ Resend OTP Exception:", e.message);
      setResendMessage("Error while resending OTP.");
    } finally {
      setResending(false);
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 20 }}>
      <Text style={{ fontSize: 20, marginBottom: 10, textAlign: "center" }}>
        Enter the 6-digit OTP sent to{"\n"}
        <Text style={{ fontWeight: "bold" }}>{email}</Text>
      </Text>

      <TextInput
        placeholder="Enter OTP"
        value={otp}
        onChangeText={setOtp}
        keyboardType="numeric"
        maxLength={6}
        style={{
          borderWidth: 1,
          borderColor: "#ccc",
          padding: 10,
          borderRadius: 10,
          textAlign: "center",
          fontSize: 20,
          letterSpacing: 4,
          marginBottom: 20,
        }}
      />

      {loading ? (
        <ActivityIndicator size="large" color="#00346a" />
      ) : success ? (
        <LottieView
          ref={animationRef}
          source={require("../assets/success.json")}
          autoPlay
          loop={false}
          style={{ width: 120, height: 120, alignSelf: "center" }}
        />
      ) : (
        <Button mode="contained" onPress={handleVerifyOTP}>
          Verify OTP
        </Button>
      )}

      <View style={{ marginTop: 25 }}>
        <Button
          mode="outlined"
          onPress={handleResendOTP}
          disabled={resending || cooldown > 0}
        >
          {cooldown > 0 ? `Resend OTP in ${cooldown}s` : "Resend OTP"}
        </Button>

        {resendMessage ? (
          <Text
            style={{
              marginTop: 10,
              color: resendMessage.includes("OTP sent") ? "green" : "red",
              textAlign: "center",
            }}
          >
            {resendMessage}
          </Text>
        ) : null}
      </View>
    </View>
  );
};

export default OTPConfirmation;
