import { addressInputSchema, provinceNames, shippingFor, type Province } from '@gear-store/shared';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useRef, useState, type ComponentRef, type Ref } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { Button } from '../../src/components/Button';
import { useAuth } from '../../src/lib/auth';
import { formatRupiah } from '../../src/lib/format';
import { addressesKey, orders } from '../../src/lib/orders';
import { useBottomSpace } from '../../src/lib/use-bottom-space';
import { colors, mono } from '../../src/theme';

type Field = 'recipient' | 'phone' | 'line1' | 'line2' | 'city' | 'province' | 'postalCode' | 'label';
type Input = ComponentRef<typeof TextInput>;

export default function NewAddressScreen() {
  const state = useAuth();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const bottom = useBottomSpace();
  // "next" on the keyboard moves down the form; the province is a picker, so city's "next" opens it
  const phoneField = useRef<Input>(null);
  const line1Field = useRef<Input>(null);
  const line2Field = useRef<Input>(null);
  const cityField = useRef<Input>(null);
  const postalCodeField = useRef<Input>(null);
  const labelField = useRef<Input>(null);
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
    // padding on Android too: edge to edge (SDK 58), the window no longer shrinks for the keyboard. The view
    // measures itself from below the header, so the header's height is added to reach the keyboard's screen edge.
    <KeyboardAvoidingView style={styles.fill} behavior="padding" keyboardVerticalOffset={headerHeight}>
      <ScrollView
        contentContainerStyle={[styles.page, { paddingBottom: bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <Input
          label="Recipient"
          value={values.recipient}
          onChangeText={set('recipient')}
          error={errors.recipient}
          autoComplete="name"
          next={phoneField}
        />
        <Input
          inputRef={phoneField}
          label="Mobile number"
          value={values.phone}
          onChangeText={set('phone')}
          error={errors.phone}
          keyboardType="phone-pad"
          autoComplete="tel"
          placeholder="0812 3456 7890"
          next={line1Field}
        />
        <Input
          inputRef={line1Field}
          label="Street address"
          value={values.line1}
          onChangeText={set('line1')}
          error={errors.line1}
          autoComplete="street-address"
          next={line2Field}
        />
        <Input
          inputRef={line2Field}
          label="Building, floor, landmark (optional)"
          value={values.line2}
          onChangeText={set('line2')}
          error={errors.line2}
          next={cityField}
        />
        <Input
          inputRef={cityField}
          label="City or regency"
          value={values.city}
          onChangeText={set('city')}
          error={errors.city}
          returnKeyType="next"
          onSubmitEditing={() => setPicking(true)}
        />

        <View style={styles.field}>
          <Text style={styles.label}>Province</Text>
          <Pressable
            onPress={() => setPicking(true)}
            style={[styles.input, styles.picker, errors.province && styles.inputError]}
            accessibilityRole="button"
            accessibilityLabel={values.province ? `Province, ${values.province}` : 'Choose a province'}
          >
            <Text style={[values.province ? styles.inputText : styles.placeholder, styles.pickerText]}>
              {values.province || 'Choose a province'}
            </Text>
            <Text style={styles.pickerMark} importantForAccessibility="no" accessibilityElementsHidden>
              ▾
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
          inputRef={postalCodeField}
          label="Postal code"
          value={values.postalCode}
          onChangeText={set('postalCode')}
          error={errors.postalCode}
          keyboardType="number-pad"
          maxLength={5}
          autoComplete="postal-code"
          next={labelField}
        />
        <Input
          inputRef={labelField}
          label="Label (optional)"
          value={values.label}
          onChangeText={set('label')}
          error={errors.label}
          placeholder="Home, Office"
          returnKeyType="done"
          onSubmitEditing={() => void save()}
        />

        {formError && <Text style={styles.error}>{formError}</Text>}
        <Button
          label={busy ? 'Saving…' : 'Save address'}
          onPress={() => void save()}
          disabled={busy}
          busy={busy}
          style={styles.save}
        />
      </ScrollView>

      <Modal
        visible={picking}
        animationType="slide"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setPicking(false)}
      >
        {/* drawn under the system bars, as the app is edge-to-edge: the insets keep the list clear of them */}
        <View style={[styles.modal, { paddingTop: insets.top + 16, paddingBottom: insets.bottom }]}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>Province</Text>
            <Pressable
              onPress={() => setPicking(false)}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
              accessibilityRole="button"
            >
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

function Input({
  label,
  error,
  inputRef,
  next,
  ...props
}: TextInputProps & {
  label: string;
  error?: string;
  inputRef?: Ref<Input>;
  /** the field "next" on the keyboard moves to */
  next?: { current: Input | null };
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        ref={inputRef}
        {...(next && {
          returnKeyType: 'next' as const,
          submitBehavior: 'submit' as const,
          onSubmitEditing: () => next.current?.focus(),
        })}
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
    borderColor: colors.field,
    backgroundColor: colors.alu50,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  inputText: { color: colors.ink, fontSize: 16 },
  placeholder: { color: colors.ink3, fontSize: 16 },
  inputError: { borderColor: colors.danger },
  hint: { fontSize: 13, color: colors.ink2 },
  error: { fontSize: 13, color: colors.danger },
  picker: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pickerText: { flex: 1, minWidth: 0 },
  pickerMark: { fontSize: 14, color: colors.ink3 },
  save: { marginTop: 4 },
  pressed: { opacity: 0.85 },
  modal: { flex: 1, backgroundColor: colors.alu },
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
  closeButton: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  close: { fontFamily: mono, fontSize: 13, color: colors.signal },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.bench,
  },
  optionSelected: { backgroundColor: colors.alu50 },
  optionText: { fontSize: 15, color: colors.ink, flexShrink: 1 },
  optionFee: { flexShrink: 0, fontFamily: mono, fontSize: 13, color: colors.ink3 },
});
