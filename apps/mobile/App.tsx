import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './src/context/AuthContext'
import LoginScreen from './src/screens/auth/LoginScreen'
import { View, Text, StyleSheet } from 'react-native'

const queryClient = new QueryClient()

function AppContent() {
  const { isAuthenticated } = useAuth()

  if (!isAuthenticated) {
    return <LoginScreen />
  }

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Welcome to Float</Text>
      <Text style={styles.sub}>Experiment flow coming here</Text>
    </View>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </QueryClientProvider>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: 22,
    fontWeight: '600',
    color: '#1e293b',
  },
  sub: {
    fontSize: 15,
    color: '#94a3b8',
    marginTop: 8,
  },
})
