import React, { useEffect } from 'react';
import { View, Text } from 'react-native';

export default function FetchFromMeta() {
  useEffect(() => {
    console.log('🟢 FetchFromMeta screen mounted');
  }, []);

  console.log('🔄 Rendering FetchFromMeta component');

  return (
    <View style={{ padding: 20 }}>
      <Text>📊 Fetch Leads from Meta Ads Screen (Coming Soon)</Text>
    </View>
  );
}
