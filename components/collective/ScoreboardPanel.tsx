import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Defs, Line as SvgLine, Pattern, Rect as SvgRect, Svg } from 'react-native-svg';
import { CONFIG } from '../../constants/config';
import { avatarColor, COLORS } from '../../constants/theme';
import type { Profile } from '../../lib/database.types';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/useAuthStore';
import { useCollectiveStore } from '../../store/useCollectiveStore';

interface WeeklyDelta {
  userId: string;
  delta: number;
  items: { reason: string; delta: number }[];
}

export function ScoreboardPanel() {
  const collective = useCollectiveStore((s) => s.collective);
  const members = useCollectiveStore((s) => s.members);
  const currentUser = useAuthStore((s) => s.profile);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [weeklyDeltas, setWeeklyDeltas] = useState<WeeklyDelta[]>([]);

  useEffect(() => {
    if (!collective) return;
    loadData();
  }, [collective, members]);

  async function loadData() {
    if (!collective) return;
    const memberIds = members.filter((m) => m.status === 'active').map((m) => m.user_id);
    if (memberIds.length === 0) return;

    const [{ data: profileData }, { data: ledgerData }] = await Promise.all([
      supabase.from('profiles').select('*').in('id', memberIds),
      supabase
        .from('credit_ledger')
        .select('*')
        .eq('collective_id', collective.id)
        .gte('created_at', getWeekStart()),
    ]);

    setProfiles(profileData ?? []);

    const deltaMap: Record<string, WeeklyDelta> = {};
    for (const entry of ledgerData ?? []) {
      if (!deltaMap[entry.user_id]) {
        deltaMap[entry.user_id] = { userId: entry.user_id, delta: 0, items: [] };
      }
      deltaMap[entry.user_id].delta += entry.delta;
      deltaMap[entry.user_id].items.push({ reason: entry.reason, delta: entry.delta });
    }
    setWeeklyDeltas(Object.values(deltaMap));
  }

  function getWeekStart(): string {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }

  const totalWeekly = weeklyDeltas.reduce((sum, d) => sum + d.delta, 0);
  const quotaPercent = Math.min(100, Math.round((totalWeekly / CONFIG.WEEKLY_CREDIT_POOL) * 100));

  const activeMembers = members.filter((m) => m.status === 'active');
  const sortedMembers = [...activeMembers].sort((a, b) => {
    const da = weeklyDeltas.find((d) => d.userId === a.user_id)?.delta ?? 0;
    const db = weeklyDeltas.find((d) => d.userId === b.user_id)?.delta ?? 0;
    return db - da;
  });

  return (
    <ScrollView style={styles.container}>
      <View style={styles.posterContainer}>
        <Image
          source={require('../../assets/images/propaganda-poster.jpg')}
          style={styles.poster}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['transparent', COLORS.background]}
          style={styles.posterFade}
        />
      </View>

      <View style={styles.content}>
        <Text style={styles.bannerText}>WEEKLY QUOTA</Text>
        <View style={styles.titleRule} />

        <View style={styles.quotaCard}>
          <Text style={styles.quotaLabel}>COLLECTIVE CREDITS</Text>
          <View style={styles.quotaMainRow}>
            <View style={styles.quotaCreditsBlock}>
              <Text style={styles.quotaCreditsNum}>{totalWeekly}</Text>
            </View>
            <Text style={styles.quotaBigPercent}>{quotaPercent}%</Text>
          </View>
          <View style={styles.quotaBar}>
            <Svg style={StyleSheet.absoluteFillObject}>
              <Defs>
                <Pattern id="hatch" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
                  <SvgLine x1="0" y1="8" x2="8" y2="0" stroke="#5A2020" strokeWidth="1.5" />
                </Pattern>
              </Defs>
              <SvgRect width="100%" height="100%" fill="url(#hatch)" />
            </Svg>
            <View style={[styles.quotaFill, { width: `${quotaPercent}%` }]} />
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>COMRADE STANDINGS</Text>
        </View>

        {sortedMembers.map((member, index) => {
          const delta = weeklyDeltas.find((d) => d.userId === member.user_id);
          const profile = profiles.find((p) => p.id === member.user_id);
          const isChair = index === 0 && sortedMembers.length > 1;
          const isMe = member.user_id === currentUser?.id;
          const deltaVal = delta?.delta ?? 0;

          return (
            <View key={member.id} style={[styles.memberRow, isMe && styles.memberRowMe]}>
              <Text style={styles.rankNum}>{String(index + 1).padStart(2, '0')}</Text>
              <View style={[styles.avatar, { backgroundColor: avatarColor(member.user_id) }]}>
                <Ionicons name="person" size={16} color="#FFFFFF" />
              </View>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>Comrade {profile?.username ?? '—'}</Text>
                {isChair && <Text style={styles.chairLabel}>CHAIRPERSON</Text>}
              </View>
              <Text style={[styles.memberDelta, { color: deltaVal >= 0 ? COLORS.success : COLORS.danger }]}>
                {deltaVal >= 0 ? '+' : ''}{deltaVal}
              </Text>
            </View>
          );
        })}

        {sortedMembers.length === 0 && (
          <Text style={styles.empty}>The Collective awaits its comrades.</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  posterContainer: { position: 'relative' },
  poster: { width: '100%', height: 220 },
  posterFade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 80 },
  content: { padding: 16 },
  bannerText: {
    color: COLORS.primary,
    fontWeight: '900',
    letterSpacing: 4,
    fontSize: 28,
    textAlign: 'center',
    marginBottom: 10,
  },
  titleRule: { height: 3, backgroundColor: COLORS.primary, marginBottom: 20 },
  quotaCard: {
    backgroundColor: COLORS.surface,
    padding: 16,
    marginBottom: 20,
    borderTopWidth: 4,
    borderTopColor: COLORS.primary,
  },
  quotaLabel: {
    color: COLORS.muted,
    fontSize: 10,
    letterSpacing: 3,
    fontWeight: '700',
    marginBottom: 10,
  },
  quotaMainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  quotaCreditsBlock: { justifyContent: 'flex-end' },
  quotaCreditsNum: {
    color: COLORS.text,
    fontSize: 32,
    fontFamily: 'SpaceMono',
    fontWeight: '700',
    lineHeight: 36,
  },
  quotaBigPercent: {
    color: COLORS.primary,
    fontSize: 56,
    fontWeight: '900',
    lineHeight: 56,
  },
  quotaBar: {
    height: 16,
    backgroundColor: '#3D1515',
    overflow: 'hidden',
  },
  quotaFill: { height: '100%', backgroundColor: COLORS.primary },
  sectionHeader: {
    backgroundColor: COLORS.surface,
    paddingVertical: 9,
    paddingHorizontal: 16,
    marginHorizontal: -16,
    marginBottom: 1,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.primary,
  },
  sectionHeaderText: {
    color: COLORS.primary,
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 3,
    textAlign: 'center',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14,
    backgroundColor: COLORS.surface,
    marginBottom: 1,
    gap: 12,
  },
  memberRowMe: { borderLeftWidth: 3, borderLeftColor: COLORS.primary },
  rankNum: {
    color: COLORS.primary,
    fontSize: 11,
    fontFamily: 'SpaceMono',
    fontWeight: '700',
    width: 22,
    textAlign: 'center',
  },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  memberInfo: { flex: 1 },
  memberName: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  chairLabel: {
    color: COLORS.primary,
    fontSize: 9,
    letterSpacing: 2,
    fontWeight: '700',
    marginTop: 1,
  },
  memberDelta: { fontFamily: 'SpaceMono', fontSize: 16, fontWeight: '700' },
  empty: { color: COLORS.muted, textAlign: 'center', marginTop: 32, fontStyle: 'italic' },
});
