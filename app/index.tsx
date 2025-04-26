import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { Eye, EyeOff } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { FadeInUp, FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { eventEmitter, EVENTS } from '../utils/events';

SplashScreen.preventAutoHideAsync();

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);

  const [fontsLoaded] = useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
    'Inter-SemiBold': Inter_600SemiBold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  const validateEmailOrPhone = (value: string) => {
    const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
    const phoneRegex = /^[0-9]{10}$/;
  
    if (!value) {
      setEmailError('Email or phone number is required');
      return false;
    }
    if (!emailRegex.test(value) && !phoneRegex.test(value)) {
      setEmailError('Please enter a valid email or 10-digit phone number');
      return false;
    }
  
    setEmailError('');
    return true;
  };

  const validatePassword = (password: string) => {
    if (!password) {
      setPasswordError('Password is required');
      return false;
    }
    if (password.length < 5) {
      setPasswordError('Password must be at least 5 characters');
      return false;
    }
    setPasswordError('');
    return true;
  };

  const handleLogin = async () => {
    const isEmailValid = validateEmailOrPhone(email);
    const isPasswordValid = validatePassword(password);

    if (isEmailValid && isPasswordValid) {
      setLoading(true);
      try {
        const response = await fetch('https://demo-expense.geomaticxevs.in/ET-api/login.php', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ u_identify: email, u_pass: password }),
        });
        const data = await response.json();

        if (data.status === 'success') {
          setLoginError('');
          await Promise.all([
            AsyncStorage.setItem('userid', data.data.userid.toString()),
            AsyncStorage.setItem('roleId', data.data.role_id.toString()),
            AsyncStorage.setItem('currentLoginTime', Date.now().toString()),
          ]);

          eventEmitter.emit(EVENTS.USER_LOGIN);
          router.replace("/(tabs)/map");
        } else {
          setLoginError(data.message || 'Invalid email or password');
        }
      } catch (error) {
        setLoginError('Network error. Please try again.');
      } finally {
        setLoading(false);
      }
    }
  };

  if (!fontsLoaded) {
    return null;
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="light" />
      <LinearGradient
        colors={['#1a237e', '#0d47a1', '#01579b']}
        style={{ flex: 1 }}
      >
        <View style={styles.overlay} />
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            padding: 24,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignItems: 'center' }}>
            <Animated.Image
              entering={FadeInDown.duration(1000).springify()}
              source={require('../assets/images/GM-Logo.png')}
              style={styles.logo}
            />
            <Animated.Text 
              entering={FadeInDown.duration(1000).delay(200).springify()}
              style={styles.title}
            >
              Welcome Back
            </Animated.Text>

            <Animated.View 
              entering={FadeInUp.duration(1000).delay(400).springify()}
              style={styles.form}
            >
              {loginError ? (
                <Animated.Text 
                  entering={FadeInUp.duration(400)}
                  style={styles.errorText}
                >
                  {loginError}
                </Animated.Text>
              ) : null}

              <TextInput
                style={[styles.input, emailError && styles.inputError]}
                placeholder="E-mail or Telephone Number"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  if (emailError) validateEmailOrPhone(text);
                }}
              />
              {emailError ? (
                <Text style={styles.errorText}>{emailError}</Text>
              ) : null}

              <View
                style={[
                  styles.passwordContainer,
                  passwordError && styles.inputError,
                ]}
              >
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Password"
                  secureTextEntry={!showPassword}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (passwordError) validatePassword(text);
                  }}
                />
                <Pressable
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeIcon}
                >
                  {showPassword ? (
                    <EyeOff size={20} color="#666" />
                  ) : (
                    <Eye size={20} color="#666" />
                  )}
                </Pressable>
              </View>
              {passwordError ? (
                <Text style={styles.errorText}>{passwordError}</Text>
              ) : null}

              <TouchableOpacity
                style={[styles.loginButton, loading && styles.loginButtonLoading]}
                onPress={handleLogin}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.loginButtonText}>Sign In</Text>
                )}
              </TouchableOpacity>
            </Animated.View>
          </View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  logo: {
    width: 140,
    height: 140,
    resizeMode: 'contain',
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontFamily: 'Inter-SemiBold',
    color: '#ffffff',
    marginBottom: 40,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  form: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    padding: 24,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 15 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  input: {
    height: 56,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 16,
  },
  inputError: {
    borderColor: '#ef5350',
    backgroundColor: '#ffebee',
  },
  errorText: {
    color: '#d32f2f',
    fontSize: 14,
    marginBottom: 16,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    backgroundColor: 'rgba(255, 82, 82, 0.1)',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 82, 82, 0.2)',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 24,
  },
  passwordInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: 'Inter-Regular',
  },
  eyeIcon: {
    padding: 12,
  },
  loginButton: {
    backgroundColor: 'rgba(41, 98, 255, 0.9)',
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: '#1a237e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  loginButtonLoading: {
    backgroundColor: '#1565c0',
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});

export default LoginScreen;