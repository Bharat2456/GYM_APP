import React, { createContext, useContext, useMemo, useState, ReactNode } from 'react';
import { View, Text, Pressable, ScrollView, TextInput, Modal, ActivityIndicator, Switch, KeyboardAvoidingView, Platform, ViewStyle, TextStyle } from 'react-native';
import Svg, { Circle, Rect, Polyline, Line as SvgLine, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme, R, SP } from '../theme/theme';
import { Icon } from './icons';

export const ThemeCtx = createContext<Theme>(null as any);
export const useTheme = () => useContext(ThemeCtx);

type Variant = 'h1' | 'h2' | 'h3' | 'body' | 'small' | 'label' | 'num' | 'huge';
const TS: Record<Variant, TextStyle> = {
  huge: { fontSize: 44, fontWeight: '900', letterSpacing: -1 }, h1: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 }, h2: { fontSize: 20, fontWeight: '800' }, h3: { fontSize: 16, fontWeight: '700' },
  body: { fontSize: 15, fontWeight: '400', lineHeight: 21 }, small: { fontSize: 13, fontWeight: '400', lineHeight: 18 }, label: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' }, num: { fontSize: 24, fontWeight: '900' }
};
export function Txt({ v = 'body', c, style, children, ...p }: { v?: Variant; c?: 'sub' | 'mute' | 'accent' | 'good' | 'warn' | 'bad' | 'onAccent' | string; style?: TextStyle | TextStyle[]; children?: ReactNode; numberOfLines?: number; selectable?: boolean; accessibilityRole?: any }) {
  const t = useTheme(); const color = c === 'sub' ? t.sub : c === 'mute' ? t.mute : c === 'accent' ? t.accentText : c === 'good' ? t.good : c === 'warn' ? t.warn : c === 'bad' ? t.bad : c === 'onAccent' ? t.onAccent : c || t.text;
  return <Text {...p} style={[TS[v], { color }, style as any]}>{children}</Text>;
}
export const Gap = ({ h = SP.md, w }: { h?: number; w?: number }) => <View style={{ height: w ? undefined : h, width: w }} />;
export const Row = ({ children, style, gap = SP.sm, wrap, between, center = true }: { children?: ReactNode; style?: ViewStyle; gap?: number; wrap?: boolean; between?: boolean; center?: boolean }) => <View style={[{ flexDirection: 'row', alignItems: center ? 'center' : 'flex-start', gap, flexWrap: wrap ? 'wrap' : 'nowrap', justifyContent: between ? 'space-between' : 'flex-start' }, style]}>{children}</View>;

export function Screen({ children, scroll = true, pad = true, bottomPad = 24, refresh }: { children: ReactNode; scroll?: boolean; pad?: boolean; bottomPad?: number; refresh?: () => void }) {
  const t = useTheme(); const ins = useSafeAreaInsets();
  const inner = { paddingHorizontal: pad ? SP.lg : 0, paddingBottom: bottomPad };
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: ins.top }}>
      {scroll ? <ScrollView contentContainerStyle={inner} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{children}</ScrollView> : <View style={[{ flex: 1 }, inner]}>{children}</View>}
    </View>
  );
}
export function Header({ title, sub, onBack, right, big }: { title: string; sub?: string; onBack?: () => void; right?: ReactNode; big?: boolean }) {
  const t = useTheme();
  return (
    <Row between style={{ paddingVertical: SP.md, minHeight: 56 }}>
      <Row style={{ flex: 1 }} gap={SP.sm}>
        {onBack ? <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center' }}><Icon name="left" color={t.text} size={20} /></Pressable> : null}
        <View style={{ flex: 1 }}>{sub ? <Txt v="label" c="accent">{sub}</Txt> : null}<Txt v={big ? 'h1' : 'h2'} numberOfLines={2}>{title}</Txt></View>
      </Row>
      {right}
    </Row>
  );
}
export function Card({ children, style, onPress, accent, pad = SP.lg }: { children?: ReactNode; style?: ViewStyle; onPress?: () => void; accent?: boolean; pad?: number }) {
  const t = useTheme();
  const st: ViewStyle = { backgroundColor: accent ? t.accent : t.surface, borderRadius: R.lg, padding: pad, borderWidth: accent ? 0 : 1, borderColor: t.border };
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }: { pressed: boolean }) => [st, { opacity: pressed ? 0.85 : 1 }, style]}>{children}</Pressable> : <View style={[st, style]}>{children}</View>;
}
export function Btn({ label, onPress, kind = 'primary', icon, disabled, small, style, full = true }: { label: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'danger' | 'soft'; icon?: string; disabled?: boolean; small?: boolean; style?: ViewStyle; full?: boolean }) {
  const t = useTheme();
  const bg = kind === 'primary' ? t.accent : kind === 'danger' ? t.bad : kind === 'soft' ? t.surface2 : 'transparent';
  const fg = kind === 'primary' ? t.onAccent : kind === 'danger' ? '#fff' : t.text;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => [{ backgroundColor: bg, borderRadius: R.pill, paddingVertical: small ? 10 : 15, paddingHorizontal: small ? 16 : 22, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, opacity: disabled ? 0.4 : pressed ? 0.8 : 1, borderWidth: kind === 'ghost' ? 1 : 0, borderColor: t.border, alignSelf: full ? 'stretch' : 'flex-start' }, style]}>
      {icon ? <Icon name={icon} size={small ? 16 : 18} color={fg} /> : null}<Txt v="h3" style={{ color: fg, fontSize: small ? 14 : 16 }}>{label}</Txt>
    </Pressable>
  );
}
export function Chip({ label, on, onPress, icon }: { label: string; on?: boolean; onPress?: () => void; icon?: string }) {
  const t = useTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: !!on }} onPress={onPress} style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: R.pill, backgroundColor: on ? t.accent : t.surface, borderWidth: 1, borderColor: on ? t.accent : t.border, flexDirection: 'row', gap: 6, alignItems: 'center' }}>{icon ? <Icon name={icon} size={14} color={on ? t.onAccent : t.sub} /> : null}<Txt v="small" style={{ color: on ? t.onAccent : t.text, fontWeight: '700' }}>{label}</Txt></Pressable>;
}
export function Pill({ label, tone = 'mute' }: { label: string; tone?: 'good' | 'warn' | 'bad' | 'info' | 'mute' | 'accent' }) {
  const t = useTheme(); const col = tone === 'good' ? t.good : tone === 'warn' ? t.warn : tone === 'bad' ? t.bad : tone === 'info' ? t.info : tone === 'accent' ? t.accentText : t.sub;
  return <View style={{ borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: col + '22', alignSelf: 'flex-start' }}><Txt v="label" style={{ color: col, fontSize: 10 }}>{label}</Txt></View>;
}
export const DemoBadge = () => { const t = useTheme(); return <View style={{ backgroundColor: t.warn, borderRadius: R.pill, paddingHorizontal: 8, paddingVertical: 2 }}><Txt v="label" style={{ color: '#111', fontSize: 9 }}>DEMO</Txt></View>; };

export function Field({ label, value, onChangeText, placeholder, secure, keyboard, multiline, error, hint, autoCap = 'none', editable = true, suffix }: { label?: string; value: string; onChangeText: (s: string) => void; placeholder?: string; secure?: boolean; keyboard?: any; multiline?: boolean; error?: string; hint?: string; autoCap?: any; editable?: boolean; suffix?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {label ? <Txt v="label" c="sub">{label}</Txt> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: t.surface, borderRadius: R.md, borderWidth: 1, borderColor: error ? t.bad : t.border, paddingHorizontal: 14 }}>
        <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={t.mute} secureTextEntry={secure} keyboardType={keyboard} multiline={multiline} autoCapitalize={autoCap} editable={editable} accessibilityLabel={label || placeholder}
          style={{ flex: 1, color: t.text, fontSize: 16, paddingVertical: 13, minHeight: multiline ? 90 : undefined, textAlignVertical: multiline ? 'top' : 'center' }} />
        {suffix ? <Txt c="sub">{suffix}</Txt> : null}
      </View>
      {error ? <Txt v="small" c="bad">{error}</Txt> : hint ? <Txt v="small" c="mute">{hint}</Txt> : null}
    </View>
  );
}
export function Toggle({ label, sub, value, onChange }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void }) {
  const t = useTheme();
  return <Row between style={{ paddingVertical: 6 }}><View style={{ flex: 1, paddingRight: 12 }}><Txt v="h3">{label}</Txt>{sub ? <Txt v="small" c="sub">{sub}</Txt> : null}</View><Switch value={value} onValueChange={onChange} trackColor={{ true: t.accent, false: t.border }} thumbColor={value ? t.onAccent === '#FFFFFF' ? '#fff' : '#fff' : '#ddd'} accessibilityLabel={label} /></Row>;
}
export function Segmented({ options, value, onChange }: { options: { key: string; label: string }[]; value: string; onChange: (k: string) => void }) {
  const t = useTheme();
  return <View style={{ flexDirection: 'row', backgroundColor: t.surface, borderRadius: R.pill, padding: 4, borderWidth: 1, borderColor: t.border }}>{options.map((o) => <Pressable key={o.key} accessibilityRole="tab" accessibilityState={{ selected: value === o.key }} onPress={() => onChange(o.key)} style={{ flex: 1, paddingVertical: 9, borderRadius: R.pill, alignItems: 'center', backgroundColor: value === o.key ? t.accent : 'transparent' }}><Txt v="small" style={{ fontWeight: '800', color: value === o.key ? t.onAccent : t.sub }}>{o.label}</Txt></Pressable>)}</View>;
}
export function ListItem({ title, sub, right, icon, onPress, tone }: { title: string; sub?: string; right?: ReactNode; icon?: string; onPress?: () => void; tone?: string }) {
  const t = useTheme();
  const body = (
    <Row gap={12} style={{ paddingVertical: 12 }}>
      {icon ? <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={20} color={tone || t.accentText} /></View> : null}
      <View style={{ flex: 1 }}><Txt v="h3" numberOfLines={2}>{title}</Txt>{sub ? <Txt v="small" c="sub" numberOfLines={3}>{sub}</Txt> : null}</View>
      {right}{onPress && !right ? <Icon name="right" size={18} color={t.mute} /> : null}
    </Row>
  );
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress}>{body}</Pressable> : body;
}
export const Divider = () => { const t = useTheme(); return <View style={{ height: 1, backgroundColor: t.border }} />; };
export const Section = ({ title, action, onAction, children }: { title: string; action?: string; onAction?: () => void; children?: ReactNode }) => (
  <View style={{ marginTop: SP.xl, gap: SP.md }}><Row between><Txt v="label" c="sub">{title}</Txt>{action ? <Pressable onPress={onAction} hitSlop={10}><Txt v="small" c="accent" style={{ fontWeight: '800' }}>{action}</Txt></Pressable> : null}</Row>{children}</View>
);
export function Empty({ icon = 'info', title, text, action, onAction }: { icon?: string; title: string; text?: string; action?: string; onAction?: () => void }) {
  const t = useTheme();
  return <View style={{ alignItems: 'center', padding: SP.xl, gap: 10 }}><View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={28} color={t.mute} /></View><Txt v="h3" style={{ textAlign: 'center' }}>{title}</Txt>{text ? <Txt v="small" c="sub" style={{ textAlign: 'center' }}>{text}</Txt> : null}{action ? <Btn label={action} onPress={onAction!} small full={false} /> : null}</View>;
}
export const Loading = ({ label = 'Loading' }: { label?: string }) => { const t = useTheme(); return <View style={{ padding: 40, alignItems: 'center', gap: 10 }}><ActivityIndicator color={t.accent} /><Txt v="small" c="sub">{label}</Txt></View>; };
export const Callout = ({ tone = 'info', children, title }: { tone?: 'info' | 'warn' | 'bad' | 'good'; children: ReactNode; title?: string }) => {
  const t = useTheme(); const col = tone === 'warn' ? t.warn : tone === 'bad' ? t.bad : tone === 'good' ? t.good : t.info;
  return <View style={{ backgroundColor: col + '1F', borderRadius: R.md, padding: 14, flexDirection: 'row', gap: 10, borderWidth: 1, borderColor: col + '55' }}><Icon name={tone === 'good' ? 'check' : tone === 'info' ? 'info' : 'alert'} size={18} color={col} /><View style={{ flex: 1, gap: 2 }}>{title ? <Txt v="h3">{title}</Txt> : null}<Txt v="small">{children}</Txt></View></View>;
};
export function Stat({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon?: string }) {
  const t = useTheme();
  return <Card style={{ flex: 1, minWidth: 140 }} pad={14}>{icon ? <Icon name={icon} size={16} color={t.accentText} /> : null}<Txt v="num" style={{ marginTop: 6 }}>{value}</Txt><Txt v="label" c="sub">{label}</Txt>{sub ? <Txt v="small" c="mute">{sub}</Txt> : null}</Card>;
}
export const Grid = ({ children }: { children?: ReactNode }) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SP.md }}>{children}</View>;

export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children?: ReactNode }) {
  const t = useTheme(); const ins = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: t.overlay }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
        <View style={{ backgroundColor: t.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '88%', paddingBottom: ins.bottom + 8, borderWidth: 1, borderColor: t.border }}>
          <View style={{ alignItems: 'center', paddingTop: 10 }}><View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: t.border }} /></View>
          <Row between style={{ paddingHorizontal: SP.lg, paddingTop: SP.md }}><Txt v="h2" style={{ flex: 1 }}>{title}</Txt><Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close sheet"><Icon name="x" color={t.sub} /></Pressable></Row>
          <ScrollView contentContainerStyle={{ padding: SP.lg, gap: SP.md }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ---------- charts (react-native-svg) ---------- */
export function Ring({ value, max, size = 120, label, sub, color }: { value: number; max: number; size?: number; label?: string; sub?: string; color?: string }) {
  const t = useTheme(); const r = size / 2 - 9, c = 2 * Math.PI * r, pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessible accessibilityLabel={(label || '') + ' ' + Math.round(value) + ' of ' + Math.round(max)}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.surface2} strokeWidth={10} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color || t.accent} strokeWidth={10} fill="none" strokeDasharray={`${c * pct} ${c}`} strokeLinecap="round" rotation={-90} origin={`${size / 2}, ${size / 2}`} />
      </Svg>
      <Txt v="num" style={{ fontSize: size / 4.4 }}>{Math.round(value)}</Txt>{label ? <Txt v="label" c="sub" style={{ fontSize: 9 }}>{label}</Txt> : null}{sub ? <Txt v="small" c="mute" style={{ fontSize: 10 }}>{sub}</Txt> : null}
    </View>
  );
}
export function Bars({ data, height = 120, color, highlightLast = true, width = 320 }: { data: { label: string; value: number }[]; height?: number; color?: string; highlightLast?: boolean; width?: number }) {
  const t = useTheme(); const max = Math.max(1, ...data.map((d) => d.value)); const bw = Math.min(26, (width - 8) / data.length - 8); const step = width / data.length;
  return (
    <View accessible accessibilityLabel={'Bar chart: ' + data.map((d) => d.label + ' ' + d.value).join(', ')}>
      <Svg width="100%" height={height + 22} viewBox={`0 0 ${width} ${height + 22}`}>
        {data.map((d, i) => { const h = Math.max(d.value > 0 ? 3 : 0, (d.value / max) * height); const x = i * step + (step - bw) / 2; return <React.Fragment key={i}><Rect x={x} y={height - h} width={bw} height={h} rx={5} fill={highlightLast && i === data.length - 1 ? color || t.accent : (color || t.accent) + '77'} /><SvgText x={x + bw / 2} y={height + 15} fontSize={10} fill={t.mute} textAnchor="middle">{d.label}</SvgText></React.Fragment>; })}
      </Svg>
    </View>
  );
}
export function LineChart({ points, height = 120, width = 320, unit = '' }: { points: { label: string; value: number }[]; height?: number; width?: number; unit?: string }) {
  const t = useTheme(); if (points.length < 2) return <Txt v="small" c="mute">Log at least two values to see a trend.</Txt>;
  const vs = points.map((p) => p.value), lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || 1, pad = 14;
  const xy = points.map((p, i) => [pad + (i * (width - pad * 2)) / (points.length - 1), pad + (1 - (p.value - lo) / span) * (height - pad * 2)]);
  return (
    <View accessible accessibilityLabel={'Line chart from ' + points[0].value + unit + ' to ' + points[points.length - 1].value + unit}>
      <Svg width="100%" height={height + 20} viewBox={`0 0 ${width} ${height + 20}`}>
        <SvgLine x1={pad} y1={height - pad + 4} x2={width - pad} y2={height - pad + 4} stroke={t.border} strokeWidth={1} />
        <Polyline points={xy.map((p) => p.join(',')).join(' ')} fill="none" stroke={t.accent} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        {xy.map((p, i) => <Circle key={i} cx={p[0]} cy={p[1]} r={i === xy.length - 1 ? 5 : 3} fill={t.accent} stroke={t.bg} strokeWidth={2} />)}
        <SvgText x={pad} y={height + 14} fontSize={10} fill={t.mute}>{points[0].label}</SvgText><SvgText x={width - pad} y={height + 14} fontSize={10} fill={t.mute} textAnchor="end">{points[points.length - 1].label}</SvgText>
        <SvgText x={xy[xy.length - 1][0]} y={xy[xy.length - 1][1] - 10} fontSize={11} fontWeight="bold" fill={t.text} textAnchor="end">{points[points.length - 1].value + unit}</SvgText>
      </Svg>
    </View>
  );
}
export function MacroBar({ label, value, target, color, unit = 'g' }: { label: string; value: number; target?: number; color?: string; unit?: string }) {
  const t = useTheme(); const pct = target ? Math.min(1, value / target) : 0;
  return <View style={{ gap: 4 }}><Row between><Txt v="small" c="sub">{label}</Txt><Txt v="small">{Math.round(value)}{target ? ' / ' + Math.round(target) : ''} {unit}</Txt></Row><View style={{ height: 8, borderRadius: 4, backgroundColor: t.surface2, overflow: 'hidden' }}><View style={{ width: pct * 100 + '%', height: 8, backgroundColor: color || t.accent, borderRadius: 4 }} /></View></View>;
}
export class ErrorBoundary extends React.Component<{ children: ReactNode; onReset?: () => void }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error) { try { console.warn('[ErrorBoundary]', err.message); } catch {} }
  render() { if (this.state.err) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#0B0B0C' }}><Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>Something went wrong</Text><Text style={{ color: '#aaa', marginTop: 8, textAlign: 'center' }}>{this.state.err.message}</Text><Pressable onPress={() => { this.setState({ err: null }); this.props.onReset?.(); }} style={{ marginTop: 20, backgroundColor: '#C6F432', borderRadius: 99, paddingHorizontal: 24, paddingVertical: 12 }}><Text style={{ fontWeight: '800' }}>Try again</Text></Pressable></View>; return this.props.children; }
}
