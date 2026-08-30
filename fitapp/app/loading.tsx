import { View, Text, ActivityIndicator } from 'react-native';
import { colors } from '../constants/colors';

export default function Loading() {
  return (
    <View style={{ flex: 1, backgroundColor: '#1C1C1E', justifyContent: 'center', alignItems: 'center', gap: 16 }}>
      <Text style={{ color: '#00D4FF', fontSize: 48, fontWeight: 'bold', letterSpacing: 4 }}>FITAPP</Text>
      <Text style={{ color: '#555', fontSize: 14, letterSpacing: 2 }}>TRACK. COMPETE. GET ROASTED.</Text>
      <ActivityIndicator size="small" color="#00D4FF" style={{ marginTop: 24 }} />
    </View>
  );
}
