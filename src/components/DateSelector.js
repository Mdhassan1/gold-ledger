import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { formatDisplayDate, todayISODate } from '../utils/dateUtils';
import { CustomModal } from './CustomModal';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function buildCells(cursor) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const count = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells = Array(first.getDay()).fill(null);
  for (let day = 1; day <= count; day += 1) cells.push(day);
  return cells;
}

export function DateSelector({ label, value, onChange, maximumDate = todayISODate() }) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => {
    const [year, month] = (value || maximumDate).split('-').map(Number);
    return new Date(year, month - 1, 1);
  });
  const cells = useMemo(() => buildCells(cursor), [cursor]);
  const title = cursor.toLocaleString('en-IN', { month: 'long', year: 'numeric' });

  const choose = (day) => {
    const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (iso > maximumDate) return;
    onChange(iso);
    setOpen(false);
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.field, { backgroundColor: theme.colors.surfaceSecondary, borderColor: theme.colors.border }]}
      >
        <Text style={[styles.value, { color: theme.colors.text }]}>{formatDisplayDate(value)}</Text>
      </Pressable>
      <CustomModal visible={open} title="Select date" onClose={() => setOpen(false)}>
        <View style={styles.monthRow}>
          <Pressable onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
            <Text style={[styles.nav, { color: theme.colors.accent }]}>Previous</Text>
          </Pressable>
          <Text style={[styles.month, { color: theme.colors.text }]}>{title}</Text>
          <Pressable onPress={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
            <Text style={[styles.nav, { color: theme.colors.accent }]}>Next</Text>
          </Pressable>
        </View>
        <View style={styles.grid}>
          {WEEKDAYS.map((day, index) => (
            <Text key={`${day}-${index}`} style={[styles.weekday, { color: theme.colors.textMuted }]}>{day}</Text>
          ))}
          {cells.map((day, index) => {
            if (!day) return <View key={`empty-${index}`} style={styles.day} />;
            const iso = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const disabled = iso > maximumDate;
            const selected = iso === value;
            return (
              <Pressable key={iso} disabled={disabled} onPress={() => choose(day)} style={styles.day}>
                <View style={[styles.dayDot, selected && { backgroundColor: theme.colors.accent }]}>
                  <Text style={{ color: selected ? theme.colors.accentText : disabled ? theme.colors.border : theme.colors.text, fontWeight: '700' }}>
                    {day}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </CustomModal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: 14, fontWeight: '700' },
  field: { minHeight: 52, borderWidth: 1, borderRadius: 14, justifyContent: 'center', paddingHorizontal: 14 },
  value: { fontSize: 16, fontWeight: '600' },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  month: { fontSize: 16, fontWeight: '700' },
  nav: { fontSize: 14, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: '14.28%', textAlign: 'center', fontSize: 12, fontWeight: '700', marginBottom: 6 },
  day: { width: '14.28%', height: 40, alignItems: 'center', justifyContent: 'center' },
  dayDot: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
