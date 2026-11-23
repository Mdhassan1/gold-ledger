import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';

export function DoughnutChart({ segments, size = 168, strokeWidth = 22 }) {
  const { theme } = useTheme();
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <View style={styles.row}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={theme.colors.surfaceSecondary}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {total > 0
          ? segments.map((segment) => {
              const length = (segment.value / total) * circumference;
              const dash = `${length} ${circumference - length}`;
              const circle = (
                <Circle
                  key={segment.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={segment.color}
                  strokeWidth={strokeWidth}
                  fill="none"
                  strokeDasharray={dash}
                  strokeDashoffset={-offset}
                  rotation={-90}
                  origin={`${size / 2}, ${size / 2}`}
                />
              );
              offset += length;
              return circle;
            })
          : null}
      </Svg>
      <View style={styles.legend}>
        {segments.map((segment) => (
          <View key={segment.label} style={styles.legendRow}>
            <View style={[styles.swatch, { backgroundColor: segment.color }]} />
            <Text style={[styles.legendText, { color: theme.colors.text }]}>
              {segment.label} · {segment.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function BarChart({ items, color }) {
  const { theme } = useTheme();
  const max = Math.max(...items.map((item) => item.value), 1);
  if (!items.length) {
    return <Text style={{ color: theme.colors.textMuted }}>No collections in this range.</Text>;
  }
  return (
    <View style={styles.bars}>
      {items.map((item) => (
        <View key={item.key || item.label} style={styles.barCol}>
          <View style={styles.barTrack}>
            <View
              style={{
                height: Math.max(4, (item.value / max) * 110),
                backgroundColor: color || theme.colors.accent,
                borderRadius: 6,
                width: '70%',
              }}
            />
          </View>
          <Text numberOfLines={1} style={[styles.barLabel, { color: theme.colors.textMuted }]}>
            {item.shortLabel || item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  legend: { flex: 1, gap: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatch: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 13, fontWeight: '600', flex: 1 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 4 },
  barCol: { flex: 1, alignItems: 'center' },
  barTrack: { height: 116, justifyContent: 'flex-end', alignItems: 'center', width: '100%' },
  barLabel: { fontSize: 10, marginTop: 4 },
});
