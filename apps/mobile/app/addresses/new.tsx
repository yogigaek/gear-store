import { addressInputSchema, provinceNames, shippingFor, type Province } from '@gear-store/shared';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { useAuth } from '../../src/lib/auth';
import { formatRupiah } from '../../src/lib/format';
import { addressesKey, orders } from '../../src/lib/orders';
import { colors, mono } from '../../src/theme';

type Field = 'recipient' | 'phone' | 'line1' | 'line2' | 'city' | 'province' | 'postalCode' | 'label';

export default function NewAddressScreen() {
  const state = useAuth();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<Field, string>>({
    recipient: '',
    phone: '',
    line1: '',
    line2: '',
    city: '',
    province: '',
    postalCode: '',
    label: '',
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);

  const set = (field: Field) => (value: string) => setValues((v) => ({ ...v, [field]: value }));
  const shipping = values.province ? shippingFor(values.province as Province) : null;

  const save = async () => {
    // the shared schema gives the same field messages as the web form and the API
    const parsed = addressInputSchema.safeParse(values);
    if (!parsed.success) {
      const next: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as Field | undefined;
        if (field && !next[field]) next[field] = issue.message;
      }
      setErrors(next);
      return;
    }
    if (state.status !== 'signed-in') {
      setFormError('Sign in to save an address.');
      return;
    }
    setErrors({});
    setFormError(undefined);
    setBusy(true);
    try {
      await orders.createAddress(parsed.data);
      await queryClient.invalidateQueries({ queryKey: addressesKey(state.user.id) });
      router.back();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Could not save the address. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <Input
          label="Recipient"
          value={values.recipient}
          onChangeText={set('recipient')}
          error={errors.recipient}
          autoComplete="name"
        />
        <Input
          label="Mobile number"
          value={values.phone}
          onChangeText={set('phone')}
          error={errors.phone}
          keyboardType="phone-pad"
          autoComplete="tel"
          placeholder="0812 3456 7890"
        />
        <Input
          label="Street address"
          value={values.line1}
          onChangeText={set('line1')}
          error={errors.line1}
          autoComplete="street-address"
        />
        <Input
          label="Building, floor, landmark (optional)"
          value={values.line2}
          onChangeText={set('line2')}
          error={errors.line2}
        />
        <Input label="City or regency" value={values.city} onChangeText={set('city')} error={errors.city} />

        <View style={styles.field}>
          <Text style={styles.label}>Province</Text>
          <Pressable
            onPress={() => setPicking(true)}
            style={[styles.input, errors.province && styles.inputError]}
            accessibilityRole="button"
            accessibilityLabel={values.province ? `Province, ${values.province}` : 'Choose a province'}
          >
            <Text style={values.province ? styles.inputText : styles.placeholder}>
              {values.province || 'Choose a province'}
            </Text>
          </Pressable>
          {shipping && (
            <Text style={styles.hint}>
              Shipping {formatRupiah(shipping.fee)} · {shipping.eta}
            </Text>
          )}
          {errors.province && <Text style={styles.error}>{errors.province}</Text>}
        </View>

        <Input
          label="Postal code"
          value={values.postalCode}
          onChangeText={set('postalCode')}
          error={errors.postalCode}
          keyboardType="number-pad"
          maxLength={5}
          autoComplete="postal-code"
        />
        <Input
          label="Label (optional)"
          value={values.label}
          onChangeText={set('label')}
          error={errors.label}
          placeholder="Home, Office"
        />

        {formError && <Text style={styles.error}>{formError}</Text>}
        <Pressable
          onPress={() => void save()}
          disabled={busy}
          style={[styles.primary, busy && styles.disabled]}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy, busy }}
        >
          <Text style={styles.primaryText}>{busy ? 'Saving…' : 'Save address'}</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={picking} animationType="slide" onRequestClose={() => setPicking(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>Province</Text>
            <Pressable onPress={() => setPicking(false)} hitSlop={8} accessibilityRole="button">
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>
          <FlatList
            data={provinceNames}
            keyExtractor={(name) => name}
            renderItem={({ item }) => {
              const zone = shippingFor(item);
              const selected = item === values.province;
              return (
                <Pressable
                  onPress={() => {
                    set('province')(item);
                    setPicking(false);
                  }}
                  style={[styles.option, selected && styles.optionSelected]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={styles.optionText}>{item}</Text>
                  <Text style={styles.optionFee}>{formatRupiah(zone.fee)}</Text>
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function Input({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        style={[styles.input, styles.inputText, error && styles.inputError]}
        placeholderTextColor={colors.ink3}
        accessibilityLabel={label}
      />
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { padding: 16, gap: 14 },
  field: { gap: 6 },
  label: {
    fontFamily: mono,
    fontSize: 12,
    color: colors.ink3,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.benchStrong,
    backgroundColor: colors.alu50,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  inputText: { color: colors.ink, fontSize: 16 },
  placeholder: { color: colors.ink3, fontSize: 16 },
  inputError: { borderColor: colors.danger },
  hint: { fontSize: 13, color: colors.ink2 },
  error: { fontSize: 13, color: colors.danger },
  primary: { backgroundColor: colors.signal, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  primaryText: { color: '#15181a', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.4 },
  modal: { flex: 1, backgroundColor: colors.alu, paddingTop: Platform.OS === 'ios' ? 48 : 16 },
  modalHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.bench,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  close: { fontFamily: mono, fontSize: 13, color: colors.signal },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.bench,
  },
  optionSelected: { backgroundColor: colors.alu50 },
  optionText: { fontSize: 15, color: colors.ink },
  optionFee: { fontFamily: mono, fontSize: 13, color: colors.ink3 },
});
