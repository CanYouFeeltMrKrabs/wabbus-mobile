import React, { useState, useMemo } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Alert,
  Pressable,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "@/hooks/useT";
import AppText from "@/components/ui/AppText";
import AppButton from "@/components/ui/AppButton";
import BackButton from "@/components/ui/BackButton";
import Icon from "@/components/ui/Icon";
import RequireAuth from "@/components/ui/RequireAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customerFetch, FetchError, AuthError } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { colors, spacing, borderRadius, shadows, fontSize } from "@/lib/theme";
import { showToast } from "@/lib/toast";
import type { Address } from "@/lib/types";

type FormState = {
  label: string;
  firstName: string;
  lastName: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
  isDefault: boolean;
};

const EMPTY_FORM: FormState = {
  label: "",
  firstName: "",
  lastName: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "US",
  phone: "",
  isDefault: false,
};

function splitFullName(fullName?: string): { firstName: string; lastName: string } {
  const raw = (fullName || "").trim();
  if (!raw) return { firstName: "", lastName: "" };
  const parts = raw.split(/\s+/);
  return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") };
}

/**
 * The backend may return addresses as a bare array, or wrapped in
 * { addresses: [] } or { data: [] }. Mirrors the web's normalizer.
 */
function normalizeAddressList(payload: any): Address[] {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.addresses)) return payload.addresses;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

export default function AddressesScreen() {
  return (
    <RequireAuth>
      <AddressesContent />
    </RequireAuth>
  );
}



function AddressesContent() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: addresses = [], isLoading: loading, refetch: refetchAddresses } = useQuery({
    queryKey: queryKeys.addresses.list(),
    queryFn: async () => {
      // Try primary endpoint first
      try {
        const data0 = await customerFetch<any>("/customer-addresses");
        const list = normalizeAddressList(data0);
        if (list.length > 0) return list;
      } catch (e: any) {
        if (e instanceof AuthError) throw e;
        if (e instanceof FetchError && e.status !== 404) throw e;
      }

      // Fallback endpoint
      try {
        const dataA = await customerFetch<any>("/addresses");
        const list = normalizeAddressList(dataA);
        if (list.length > 0) return list;
      } catch (e: any) {
        if (e instanceof AuthError) throw e;
        if (e instanceof FetchError && e.status !== 404) throw e;
      }

      // Last resort: pull from /customer-auth/me
      const me = await customerFetch<any>("/customer-auth/me");
      return normalizeAddressList(me?.addresses ?? []);
    },
  });
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [defaultOverride, setDefaultOverride] = useState<string | null>(null);

  // Derive display list: apply local default override without touching query cache
  const displayAddresses = useMemo(() => {
    if (!defaultOverride) return addresses;
    return addresses.map((a) => {
      const shouldBeDefault = a.publicId === defaultOverride;
      if (a.isDefault === shouldBeDefault) return a;
      return { ...a, isDefault: shouldBeDefault };
    });
  }, [addresses, defaultOverride]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (a: Address) => {
    const name = splitFullName(a.fullName);
    setEditingId(a.publicId);
    setForm({
      label: "",
      firstName: name.firstName,
      lastName: name.lastName,
      line1: a.line1 || "",
      line2: a.line2 || "",
      city: a.city || "",
      state: a.state || "",
      postalCode: a.zip || "",
      country: a.country || "US",
      phone: a.phone || "",
      isDefault: !!a.isDefault,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.line1.trim() || !form.city.trim() || !form.postalCode.trim()) {
      Alert.alert(t("account.addresses.missingFields"), t("account.addresses.requiredFieldsError"));
      return;
    }

    setSaving(true);
    const payload: Record<string, any> = {
      line1: form.line1.trim(),
      city: form.city.trim(),
      postalCode: form.postalCode.trim(),
      country: form.country,
    };
    if (form.firstName.trim()) payload.firstName = form.firstName.trim();
    if (form.lastName.trim()) payload.lastName = form.lastName.trim();
    if (form.label.trim()) payload.label = form.label.trim();
    if (form.line2.trim()) payload.line2 = form.line2.trim();
    if (form.state.trim()) payload.state = form.state.trim();
    if (form.phone.trim()) payload.phone = form.phone.trim();
    if (form.isDefault) payload.isDefault = true;

    try {
      const isEdit = editingId !== null;
      const path = isEdit ? `/customer-addresses/${editingId}` : "/customer-addresses";
      const method = isEdit ? "PATCH" : "POST";
      await customerFetch(path, { method, body: JSON.stringify(payload) });
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      await queryClient.invalidateQueries({ queryKey: queryKeys.addresses.all() });
    } catch (e: any) {
      Alert.alert(t("common.error"), e.message || t("account.addresses.errorSave"));
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    setDefaultOverride(id);
    showToast(t("account.addresses.defaultUpdated"), "success");

    try {
      await customerFetch(`/customer-addresses/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isDefault: true }),
      });
    } catch (e: any) {
      setDefaultOverride(null);
      Alert.alert(t("common.error"), e.message || t("account.addresses.errorSetDefault"));
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(t("account.addresses.removeTitle"), t("account.addresses.removeConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.remove"),
        style: "destructive",
        onPress: async () => {
          setBusyId(id);
          try {
            await customerFetch(`/customer-addresses/${id}`, { method: "DELETE" });
            await queryClient.invalidateQueries({ queryKey: queryKeys.addresses.all() });
          } catch (e: any) {
            Alert.alert(t("common.error"), e.message || t("account.addresses.errorRemove"));
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  if (showForm) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={[styles.screen, { paddingTop: insets.top }]}
      >
        <View style={styles.header}>
          <BackButton
            onPress={() => {
              setShowForm(false);
              setEditingId(null);
            }}
          />
          <AppText variant="title">
            {editingId ? t("account.addresses.editAddress") : t("account.addresses.newAddress")}
          </AppText>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
          <FormField t={t} label={t("account.addresses.labelOptional")} value={form.label} onChangeText={(v) => setForm((f) => ({ ...f, label: v }))} placeholder={t("account.addresses.labelPlaceholder")} />
          <View style={styles.row}>
            <View style={styles.halfField}>
              <FormField t={t} label={t("account.addresses.firstName")} value={form.firstName} onChangeText={(v) => setForm((f) => ({ ...f, firstName: v }))} placeholder={t("account.addresses.firstNamePlaceholder")} />
            </View>
            <View style={styles.halfField}>
              <FormField t={t} label={t("account.addresses.lastName")} value={form.lastName} onChangeText={(v) => setForm((f) => ({ ...f, lastName: v }))} placeholder={t("account.addresses.lastNamePlaceholder")} />
            </View>
          </View>
          <FormField t={t} label={t("account.addresses.addressLine1")} value={form.line1} onChangeText={(v) => setForm((f) => ({ ...f, line1: v }))} placeholder={t("account.addresses.addressLine1Placeholder")} required />
          <FormField t={t} label={t("account.addresses.addressLine2Optional")} value={form.line2} onChangeText={(v) => setForm((f) => ({ ...f, line2: v }))} placeholder={t("account.addresses.addressLine2Placeholder")} />
          <View style={styles.row}>
            <View style={styles.halfField}>
              <FormField t={t} label={t("account.addresses.city")} value={form.city} onChangeText={(v) => setForm((f) => ({ ...f, city: v }))} required />
            </View>
            <View style={styles.halfField}>
              <FormField t={t} label={t("account.addresses.state")} value={form.state} onChangeText={(v) => setForm((f) => ({ ...f, state: v }))} placeholder={t("account.addresses.statePlaceholder")} />
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.halfField}>
              <FormField t={t} label={t("account.addresses.postalCode")} value={form.postalCode} onChangeText={(v) => setForm((f) => ({ ...f, postalCode: v }))} keyboardType="number-pad" required />
            </View>
            <View style={styles.halfField}>
              <FormField t={t} label={t("account.addresses.country")} value={form.country} editable={false} />
            </View>
          </View>
          <FormField t={t} label={t("account.addresses.phoneOptional")} value={form.phone} onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))} keyboardType="phone-pad" placeholder={t("account.addresses.phonePlaceholder")} />

          <View style={styles.switchRow}>
            <AppText variant="body">{t("account.addresses.makeDefault")}</AppText>
            <Switch
              value={form.isDefault}
              onValueChange={(v) => setForm((f) => ({ ...f, isDefault: v }))}
              trackColor={{ false: colors.gray200, true: colors.brandBlue }}
              thumbColor={colors.white}
            />
          </View>

          <View style={styles.formActions}>
            <AppButton
              title={t("common.cancel")}
              variant="outline"
              onPress={() => {
                setShowForm(false);
                setEditingId(null);
              }}
              style={{ flex: 1 }}
            />
            <AppButton
              title={saving ? t("account.addresses.saving") : editingId ? t("account.addresses.saveChanges") : t("account.addresses.saveAddress")}
              variant="primary"
              loading={saving}
              onPress={handleSave}
              style={{ flex: 1 }}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  const sorted = displayAddresses;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackButton />
        <AppText variant="title">{t("account.addresses.heading")}</AppText>
        <BackButton icon="close" />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.brandBlue} style={styles.loader} />
      ) : sorted.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="location-off" size={48} color={colors.gray300} />
          <AppText variant="subtitle" color={colors.muted}>
            {t("account.addresses.noSavedAddresses")}
          </AppText>
          <AppButton title={t("account.addresses.addAddress")} variant="primary" icon="add" onPress={openCreate} />
        </View>
      ) : (
        <>
          <FlatList
            data={sorted}
            keyExtractor={(a) => a.publicId}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const busy = busyId === item.publicId;
              return (
                <View style={[styles.card, item.isDefault && styles.cardDefault]}>
                  <View style={[styles.defaultBadge, !item.isDefault && { opacity: 0 }]}>
                    <AppText variant="tiny" color={colors.brandBlue} weight="bold">
                      {t("account.addresses.default")}
                    </AppText>
                  </View>
                  <AppText variant="label">{item.fullName}</AppText>
                  <AppText variant="body" color={colors.muted}>
                    {item.line1}
                    {item.line2 ? `, ${item.line2}` : ""}
                  </AppText>
                  <AppText variant="body" color={colors.muted}>
                    {item.city}, {item.state} {item.zip || item.postalCode}
                  </AppText>
                  {item.phone && (
                    <AppText variant="caption" color={colors.mutedLight} style={{ marginTop: spacing[1] }}>
                      {item.phone}
                    </AppText>
                  )}

                  <View style={styles.cardActions}>
                    <AppButton
                      title={t("account.addresses.edit")}
                      variant="primary"
                      size="sm"
                      icon="edit"
                      disabled={busy}
                      onPress={() => openEdit(item)}
                      style={{ flex: 1 }}
                    />
                    <AppButton
                      title={item.isDefault ? t("account.addresses.default") : t("account.addresses.setDefault")}
                      variant={item.isDefault ? "secondary" : "outline"}
                      size="sm"
                      icon="check-circle"
                      disabled={busy || item.isDefault}
                      loading={busy && !item.isDefault}
                      onPress={() => handleSetDefault(item.publicId)}
                      style={{ flex: 1 }}
                    />
                    <AppButton
                      title={t("common.remove")}
                      variant="danger"
                      size="sm"
                      icon="delete-outline"
                      disabled={busy}
                      onPress={() => handleDelete(item.publicId)}
                      style={{ flex: 1 }}
                    />
                  </View>
                </View>
              );
            }}
          />
          <View style={[styles.addBtnBar, { paddingBottom: Math.max(insets.bottom, spacing[4]) }]}>
            <AppButton
              title={t("account.addresses.addNewAddress")}
              variant="primary"
              fullWidth
              size="lg"
              icon="add"
              onPress={openCreate}
            />
          </View>
        </>
      )}
    </View>
  );
}

function FormField({
  t,
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  editable = true,
  required,
}: {
  t: (key: string) => string;
  label: string;
  value: string;
  onChangeText?: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "number-pad" | "phone-pad" | "email-address";
  editable?: boolean;
  required?: boolean;
}) {
  return (
    <View style={styles.field}>
      <AppText variant="label" style={styles.fieldLabel}>
        {label}
        {required ? " *" : ""}
      </AppText>
      <TextInput
        style={[styles.input, !editable && styles.inputDisabled]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedLight}
        keyboardType={keyboardType || "default"}
        editable={editable}
        autoCapitalize="words"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[2],
  },
  loader: { marginTop: spacing[16] },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing[3] },
  list: { paddingHorizontal: spacing[4], paddingBottom: spacing[10] },
  card: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    marginBottom: spacing[3],
    borderWidth: 1.5,
    borderColor: "transparent",
    ...shadows.sm,
  },
  cardDefault: {
    borderColor: colors.brandBlueBorder,
  },
  defaultBadge: {
    backgroundColor: colors.brandBlueLight,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[0.5],
    borderRadius: borderRadius.sm,
    alignSelf: "flex-start",
    marginBottom: spacing[2],
  },
  cardActions: {
    flexDirection: "row",
    gap: spacing[2],
    marginTop: spacing[3],
  },
  addBtnBar: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    ...shadows.md,
  },
  formContent: { paddingHorizontal: spacing[4], paddingBottom: spacing[10] },
  row: { flexDirection: "row", gap: spacing[3] },
  halfField: { flex: 1 },
  field: { marginBottom: spacing[3] },
  fieldLabel: { marginBottom: spacing[1] },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    padding: spacing[3],
    fontSize: fontSize.base,
    color: colors.foreground,
    backgroundColor: colors.white,
  },
  inputDisabled: { backgroundColor: colors.gray100, color: colors.muted },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing[3],
    marginBottom: spacing[3],
  },
  formActions: {
    flexDirection: "row",
    gap: spacing[3],
    marginTop: spacing[2],
  },
});
