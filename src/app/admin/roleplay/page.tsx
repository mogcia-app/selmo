"use client";

import Link from "next/link";
import { FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";

import {
  EmptyState,
  KpiCard,
  PageHeader,
  PageShell,
  Panel,
  Placeholder,
  StatusBadge,
  useAdminInsights,
} from "@/app/admin/_components/admin-insights";
import { useAuth } from "@/features/auth/auth-provider";
import type { KnowledgeProduct } from "@/lib/firebase/knowledge";
import {
  createRoleplayAssignment,
  createRoleplayScenario,
  createRoleplayTalkGuide,
  subscribeToRoleplayAssignments,
  subscribeToRoleplayTalkGuides,
  updateRoleplayScenarioVisibility,
  updateRoleplayScenario,
  updateRoleplayTalkGuide,
  type RoleplayDifficulty,
  type RoleplayAssignment,
  type RoleplayScenario,
  type RoleplayTalkGuide,
} from "@/lib/firebase/roleplay";

export default function AdminRoleplayPage() {
  const { profile } = useAuth();
  const { roleplayScenarios, roleplayResults, memberRows, products, users, error } = useAdminInsights();
  const [assignments, setAssignments] = useState<RoleplayAssignment[]>([]);
  const [talkGuides, setTalkGuides] = useState<RoleplayTalkGuide[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const [assignmentReason, setAssignmentReason] = useState("");
  const [assignmentMessage, setAssignmentMessage] = useState<string | null>(null);
  const [scenarioMessage, setScenarioMessage] = useState<string | null>(null);
  const [guideMessage, setGuideMessage] = useState<string | null>(null);
  const [isScenarioDialogOpen, setIsScenarioDialogOpen] = useState(false);
  const [editingScenario, setEditingScenario] = useState<RoleplayScenario | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [isPublishingScenarioId, setIsPublishingScenarioId] = useState<string | null>(null);
  const [guideProductId, setGuideProductId] = useState("");
  const [guideCategory, setGuideCategory] = useState<"新規" | "既存">("新規");
  const [guideSteps, setGuideSteps] = useState("");
  const [guideNotes, setGuideNotes] = useState("");
  const [editingGuideId, setEditingGuideId] = useState<string | null>(null);
  const [isSavingGuide, setIsSavingGuide] = useState(false);
  const completedUserIds = new Set(roleplayResults.map((result) => result.userId));
  const inactiveMembers = memberRows.filter((member) => !completedUserIds.has(member.id));
  const averageScore = roleplayResults.length > 0 ? Math.round(roleplayResults.reduce((sum, result) => sum + result.score, 0) / roleplayResults.length) : null;
  const activeAssignments = useMemo(
    () => assignments.filter((assignment) => assignment.status === "assigned"),
    [assignments],
  );
  const managedScenarios = useMemo(
    () =>
      roleplayScenarios.filter((scenario) => {
        const creator = users.find((user) => user.uid === scenario.createdBy);
        return creator?.role !== "sales";
      }),
    [roleplayScenarios, users],
  );

  useEffect(() => {
    if (!profile?.companyId) return;
    const unsubscribers = [
      subscribeToRoleplayAssignments(
        { companyId: profile.companyId, isAdmin: true },
        setAssignments,
        () => undefined,
      ),
      subscribeToRoleplayTalkGuides(
        profile.companyId,
        setTalkGuides,
        () => setGuideMessage("進め方テンプレートの読み込みに失敗しました。"),
      ),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [profile?.companyId]);

  async function handleSaveTalkGuide(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGuideMessage(null);
    const selectedProduct = products.find((product) => product.id === guideProductId);
    const steps = splitGuideLines(guideSteps);

    if (!profile?.uid || !profile.companyId || !selectedProduct || steps.length === 0) {
      setGuideMessage("商材を選択し、進め方を1つ以上入力してください。");
      return;
    }

    setIsSavingGuide(true);
    try {
      const duplicateGuide = talkGuides.find(
        (guide) =>
          guide.id !== editingGuideId &&
          guide.productId === selectedProduct.id &&
          guide.scenarioCategory === guideCategory,
      );
      const payload = {
        companyId: profile.companyId,
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        scenarioCategory: guideCategory,
        steps,
        notes: guideNotes.trim(),
        createdBy: profile.uid,
      };

      if (editingGuideId) {
        await updateRoleplayTalkGuide(editingGuideId, payload);
      } else if (duplicateGuide) {
        await updateRoleplayTalkGuide(duplicateGuide.id, payload);
      } else {
        await createRoleplayTalkGuide(payload);
      }

      setGuideMessage(`${selectedProduct.name} / ${guideCategory} の進め方を保存しました。`);
      setGuideProductId("");
      setGuideCategory("新規");
      setGuideSteps("");
      setGuideNotes("");
      setEditingGuideId(null);
    } catch (nextError) {
      setGuideMessage(nextError instanceof Error ? nextError.message : "進め方の保存に失敗しました。");
    } finally {
      setIsSavingGuide(false);
    }
  }

  function handleEditTalkGuide(guide: RoleplayTalkGuide) {
    setGuideProductId(guide.productId);
    setGuideCategory(guide.scenarioCategory);
    setGuideSteps(guide.steps.join("\n"));
    setGuideNotes(guide.notes);
    setEditingGuideId(guide.id);
    setGuideMessage("編集内容を入力して保存してください。");
  }

  async function handleAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAssignmentMessage(null);

    const selectedMembers = memberRows.filter((row) => selectedUserIds.includes(row.id));
    const scenario = roleplayScenarios.find((item) => item.id === selectedScenarioId);

    if (!profile?.uid || !profile.companyId || selectedMembers.length === 0 || !scenario) {
      setAssignmentMessage("営業メンバーを1人以上とシナリオを選択してください。");
      return;
    }

    setIsAssigning(true);
    try {
      await Promise.all(
        selectedMembers.map((member) =>
          createRoleplayAssignment({
            companyId: profile.companyId,
            userId: member.id,
            scenario,
            assignedBy: profile.uid,
            reason: assignmentReason.trim() || "次回商談に向けた練習課題です。",
          }),
        ),
      );
      setAssignmentMessage(`${selectedMembers.length}人にシナリオを表示しました。`);
      setSelectedUserIds([]);
      setAssignmentReason("");
    } catch (nextError) {
      setAssignmentMessage(nextError instanceof Error ? nextError.message : "割り当てに失敗しました。");
    } finally {
      setIsAssigning(false);
    }
  }

  async function handlePublishToAll(scenario: RoleplayScenario) {
    setIsPublishingScenarioId(scenario.id);
    setScenarioMessage(null);
    try {
      await updateRoleplayScenarioVisibility(scenario.id, "all");
      setScenarioMessage("このシナリオをsales全員に表示しました。");
    } catch (nextError) {
      setScenarioMessage(nextError instanceof Error ? nextError.message : "全員表示に失敗しました。");
    } finally {
      setIsPublishingScenarioId(null);
    }
  }

  return (
    <PageShell>
      <div className="mx-auto max-w-[1480px]">
        <PageHeader
          eyebrow="ROLEPLAY MANAGEMENT"
          title="ロープレ管理"
          description="商材別シナリオと実施状況を確認し、未実施者や低スコアのメンバーに指導をつなげます。"
          action={
            <button
              type="button"
              onClick={() => {
                setScenarioMessage(null);
                setIsScenarioDialogOpen(true);
              }}
              className="rounded-[14px] border border-[#f0c655] bg-[#ffd84d] px-5 py-3 text-[13px] font-black text-[#171717] transition hover:bg-[#ffcf24]"
            >
              シナリオ作成
            </button>
          }
        />
        {error ? <ErrorBox message={error} /> : null}
        {scenarioMessage ? (
          <div className="mt-5 rounded-[16px] border border-[#d9edc8] bg-[#f7fff2] px-4 py-3 text-[13px] font-bold text-[#4e7a24]">
            {scenarioMessage}
          </div>
        ) : null}

        <section className="mt-8 grid gap-5 md:grid-cols-5">
          <KpiCard label="シナリオ" value={`${managedScenarios.length}件`} note="admin管理" />
          <KpiCard label="進め方" value={`${talkGuides.length}件`} note="商材×タイプ" />
          <KpiCard label="実施回数" value={`${roleplayResults.length}回`} note="結果保存済み" />
          <KpiCard label="平均スコア" value={averageScore === null ? "-" : `${averageScore}点`} note={averageScore === null ? "結果なし" : "全体平均"} />
          <KpiCard label="未実施者" value={`${inactiveMembers.length}人`} note="結果未保存の営業メンバー" />
          <KpiCard label="割り当て中" value={`${activeAssignments.length}件`} note="未完了の課題" />
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(360px,0.7fr)_minmax(0,1.3fr)]">
          <Panel title="商談の進め方を登録">
            <form onSubmit={handleSaveTalkGuide} className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="商材" required>
                  <select
                    value={guideProductId}
                    onChange={(event) => setGuideProductId(event.target.value)}
                    className="h-11 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#e0bd4b]"
                  >
                    <option value="">商材を選択</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>{product.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="タイプ" required>
                  <select
                    value={guideCategory}
                    onChange={(event) => setGuideCategory(event.target.value as "新規" | "既存")}
                    className="h-11 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#e0bd4b]"
                  >
                    <option value="新規">新規</option>
                    <option value="既存">既存</option>
                  </select>
                </Field>
              </div>
              <Field label="進め方" required>
                <textarea
                  value={guideSteps}
                  onChange={(event) => setGuideSteps(event.target.value)}
                  className="min-h-[180px] w-full resize-y rounded-[14px] border border-[#e4e8ef] bg-white px-4 py-3 text-[13px] leading-7 text-[#343b48] outline-none focus:border-[#e0bd4b]"
                  placeholder={"1行に1つ\n例：最初に自己紹介をする\n例：現状の取り組みを確認する\n例：課題を深掘りする\n例：次回アクションを合意する"}
                />
              </Field>
              <Field label="補足メモ">
                <textarea
                  value={guideNotes}
                  onChange={(event) => setGuideNotes(event.target.value)}
                  className="min-h-[82px] w-full resize-y rounded-[14px] border border-[#e4e8ef] bg-white px-4 py-3 text-[13px] leading-6 text-[#343b48] outline-none focus:border-[#e0bd4b]"
                  placeholder="例：初回は説明よりヒアリングを優先する"
                />
              </Field>
              <div className="flex flex-wrap items-center justify-between gap-3">
                {guideMessage ? (
                  <p className="rounded-[12px] bg-[#fcfcfd] px-3 py-2 text-[12px] leading-5 text-[#596273]">
                    {guideMessage}
                  </p>
                ) : <span />}
                <div className="flex gap-2">
                  {editingGuideId ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingGuideId(null);
                        setGuideProductId("");
                        setGuideCategory("新規");
                        setGuideSteps("");
                        setGuideNotes("");
                        setGuideMessage(null);
                      }}
                      className="h-11 rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[13px] font-bold text-[#596273]"
                    >
                      解除
                    </button>
                  ) : null}
                  <button
                    type="submit"
                    disabled={isSavingGuide}
                    className="h-11 rounded-[14px] border border-[#f0c655] bg-[#ffd84d] px-5 text-[13px] font-black text-[#171717] disabled:opacity-60"
                  >
                    {isSavingGuide ? "保存中" : editingGuideId ? "更新する" : "保存する"}
                  </button>
                </div>
              </div>
            </form>
          </Panel>

          <Panel title="登録済みの進め方">
            {talkGuides.length > 0 ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {talkGuides.map((guide) => (
                  <button
                    key={guide.id}
                    type="button"
                    onClick={() => handleEditTalkGuide(guide)}
                    className="rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4 text-left transition hover:border-[#e0bd4b] hover:bg-white"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[14px] font-black text-[#171717]">{guide.productName || "商材未設定"}</div>
                        <div className="mt-1 text-[12px] font-bold text-[#8a6500]">{guide.scenarioCategory}</div>
                      </div>
                      <StatusBadge tone="normal" label={`${guide.steps.length}項目`} />
                    </div>
                    <ol className="mt-3 space-y-1 text-[12px] leading-5 text-[#596273]">
                      {guide.steps.slice(0, 5).map((step, index) => (
                        <li key={`${guide.id}-${index}`}>{index + 1}. {step}</li>
                      ))}
                      {guide.steps.length > 5 ? <li className="font-bold text-[#8a909b]">+{guide.steps.length - 5}項目</li> : null}
                    </ol>
                    {guide.notes ? <p className="mt-3 line-clamp-2 text-[12px] leading-5 text-[#7a808c]">{guide.notes}</p> : null}
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState title="進め方はまだありません" body="商材×新規/既存ごとの標準的な打ち合わせの進め方を登録できます。" />
            )}
          </Panel>
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.7fr)]">
          <Panel title="シナリオ一覧">
            {managedScenarios.length > 0 ? (
              <div className="space-y-3">
                {managedScenarios.map((scenario) => {
                  const results = roleplayResults.filter((result) => result.scenarioId === scenario.id);
                  const score = results.length > 0 ? Math.round(results.reduce((sum, result) => sum + result.score, 0) / results.length) : null;
                  const product = products.find((item) => item.id === scenario.productId);
                  const creator = users.find((user) => user.uid === scenario.createdBy);
                  return (
                    <div key={scenario.id} className="grid gap-3 rounded-[16px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-4 md:grid-cols-[minmax(0,1fr)_110px_110px_120px_260px]">
                      <div className="min-w-0">
                        <div className="truncate text-[14px] font-black text-[#171717]">{scenario.title}</div>
                        <div className="mt-1 truncate text-[12px] text-[#7a808c]">
                          {product?.name || scenario.productName || "商材未設定"} ・ {scenario.scenarioCategory || "分類未設定"} ・ {scenario.targetSegment || scenario.customerRole}
                        </div>
                        <div className="mt-1 truncate text-[12px] text-[#9aa1ac]">作成者: {creator?.name || creator?.email || "不明"}</div>
                      </div>
                      <span className="text-[13px] font-bold text-[#596273]">{formatDifficulty(scenario.difficulty)}</span>
                      <span className="text-[13px] font-bold text-[#596273]">{results.length}回実施</span>
                      <div className="space-y-1">
                        <div className="text-[13px] font-bold text-[#596273]">{score === null ? "結果なし" : `${score}点`}</div>
                        <StatusBadge tone={scenario.visibility === "all" ? "good" : "normal"} label={scenario.visibility === "all" ? "全員表示" : "未表示"} />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setScenarioMessage(null);
                            setSelectedScenarioId(scenario.id);
                            setAssignmentMessage("表示する営業メンバーを選択してください。");
                          }}
                          className="rounded-[12px] border border-[#e4e8ef] bg-white px-3 py-2 text-[12px] font-bold text-[#343b48]"
                        >
                          対象者に表示
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void handlePublishToAll(scenario);
                          }}
                          disabled={isPublishingScenarioId === scenario.id || scenario.visibility === "all"}
                          className="rounded-[12px] border border-[#f0c655] bg-[#fff5d8] px-3 py-2 text-[12px] font-black text-[#8a6500] disabled:opacity-50"
                        >
                          {isPublishingScenarioId === scenario.id ? "表示中" : "全員に表示"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setScenarioMessage(null);
                            setEditingScenario(scenario);
                          }}
                          className="rounded-[12px] border border-[#e4e8ef] bg-white px-3 py-2 text-[12px] font-bold text-[#343b48]"
                        >
                          編集
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState title="シナリオはまだありません" body="シナリオ作成後、実施状況を確認できます。" />
            )}
          </Panel>

          <div className="space-y-5">
            <Panel title="未実施者一覧">
              {inactiveMembers.length > 0 ? (
                <div className="space-y-2">
                  {inactiveMembers.map((member) => (
                    <Link key={member.id} href={`/admin/members/${member.id}`} className="flex items-center justify-between rounded-[14px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
                      <span className="text-[13px] font-black text-[#171717]">{member.name}</span>
                      <StatusBadge tone="risk" label="未実施" />
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState title="未実施者はいません" body="全員にロープレ結果が保存されています。" />
              )}
            </Panel>

            <Panel title="シナリオをsalesに表示">
              <form onSubmit={handleAssign} className="space-y-3">
                <div className="rounded-[14px] border border-[#e4e8ef] bg-white px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[12px] font-black text-[#343b48]">営業メンバー</div>
                    <button
                      type="button"
                      onClick={() => setSelectedUserIds((current) => (current.length === memberRows.length ? [] : memberRows.map((member) => member.id)))}
                      className="text-[12px] font-black text-[#8a6500]"
                    >
                      {selectedUserIds.length === memberRows.length ? "全解除" : "全選択"}
                    </button>
                  </div>
                  <div className="mt-2 max-h-[180px] space-y-2 overflow-y-auto">
                    {memberRows.map((member) => (
                      <label key={member.id} className="flex cursor-pointer items-center gap-2 rounded-[10px] px-2 py-2 text-[13px] font-bold text-[#343b48] hover:bg-[#fcfcfd]">
                        <input
                          type="checkbox"
                          checked={selectedUserIds.includes(member.id)}
                          onChange={(event) => {
                            setSelectedUserIds((current) =>
                              event.target.checked ? [...current, member.id] : current.filter((id) => id !== member.id),
                            );
                          }}
                        />
                        {member.name}
                      </label>
                    ))}
                  </div>
                </div>
                <select
                  value={selectedScenarioId}
                  onChange={(event) => setSelectedScenarioId(event.target.value)}
                  className="h-11 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-3 text-[13px] font-bold text-[#343b48] outline-none focus:border-[#e0bd4b]"
                >
                  <option value="">シナリオを選択</option>
                  {managedScenarios.map((scenario) => (
                    <option key={scenario.id} value={scenario.id}>{scenario.title}</option>
                  ))}
                </select>
                <textarea
                  value={assignmentReason}
                  onChange={(event) => setAssignmentReason(event.target.value)}
                  className="min-h-[96px] w-full resize-y rounded-[14px] border border-[#e4e8ef] bg-white px-3 py-3 text-[13px] leading-6 text-[#343b48] outline-none focus:border-[#e0bd4b]"
                  placeholder="表示理由。例：価格説明の改善が必要なため"
                />
                <button
                  type="submit"
                  disabled={isAssigning}
                  className="inline-flex h-11 w-full items-center justify-center rounded-[14px] border border-[#f0c655] bg-[#ffd84d] text-[13px] font-black text-[#171717] disabled:opacity-60"
                >
                  {isAssigning ? "表示中" : "選択したsalesに表示"}
                </button>
                {assignmentMessage ? (
                  <p className="rounded-[12px] bg-[#fcfcfd] px-3 py-2 text-[12px] leading-5 text-[#596273]">
                    {assignmentMessage}
                  </p>
                ) : null}
              </form>
            </Panel>

            <Panel title="ロープレ結果">
              {roleplayResults.length > 0 ? (
                <div className="space-y-2">
                  {roleplayResults.slice(0, 8).map((result) => {
                    const member = memberRows.find((row) => row.id === result.userId);
                    return (
                      <Link
                        key={result.id}
                        href={`/admin/roleplay/results/${result.id}`}
                        className="w-full rounded-[14px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3 text-left transition hover:border-[#e0bd4b] hover:bg-white"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-black text-[#171717]">{member?.name ?? "未設定"}</div>
                            <div className="mt-1 truncate text-[12px] font-bold text-[#596273]">{result.scenarioTitle}</div>
                            <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[#7a808c]">{result.summary || "分析なし"}</p>
                          </div>
                          <span className="shrink-0 rounded-[12px] bg-[#171717] px-3 py-2 text-[12px] font-black text-white">{result.score}点</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <Placeholder>ロープレ結果はまだありません</Placeholder>
              )}
            </Panel>

            <Panel title="割り当て中の課題">
              {activeAssignments.length > 0 ? (
                <div className="space-y-2">
                  {activeAssignments.slice(0, 6).map((assignment) => {
                    const member = memberRows.find((row) => row.id === assignment.userId);
                    return (
                      <div key={assignment.id} className="rounded-[14px] border border-[#eef1f5] bg-[#fcfcfd] px-4 py-3">
                        <div className="text-[13px] font-black text-[#171717]">{member?.name ?? "未設定"}</div>
                        <div className="mt-1 text-[12px] font-bold text-[#596273]">{assignment.scenarioTitle}</div>
                        <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[#7a808c]">{assignment.reason}</p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <Placeholder>未完了の割り当てはありません</Placeholder>
              )}
            </Panel>
          </div>
        </section>
      </div>
      {isScenarioDialogOpen && profile?.uid && profile.companyId ? (
        <ScenarioCreateDialog
          products={products}
          userId={profile.uid}
          companyId={profile.companyId}
          onClose={() => setIsScenarioDialogOpen(false)}
          onCreated={() => {
            setIsScenarioDialogOpen(false);
            setScenarioMessage("シナリオ一覧に登録しました。sales側へ表示するには、一覧から対象者を選んでください。");
          }}
          onError={setScenarioMessage}
        />
      ) : null}
      {editingScenario && profile?.uid && profile.companyId ? (
        <ScenarioCreateDialog
          products={products}
          userId={profile.uid}
          companyId={profile.companyId}
          scenario={editingScenario}
          onClose={() => setEditingScenario(null)}
          onCreated={() => {
            setEditingScenario(null);
            setScenarioMessage("シナリオを更新しました。");
          }}
          onError={setScenarioMessage}
        />
      ) : null}
    </PageShell>
  );
}

function ScenarioCreateDialog({
  products,
  userId,
  companyId,
  scenario,
  onClose,
  onCreated,
  onError,
}: {
  products: KnowledgeProduct[];
  userId: string;
  companyId: string;
  scenario?: RoleplayScenario;
  onClose: () => void;
  onCreated: () => void;
  onError: (message: string | null) => void;
}) {
  const [title, setTitle] = useState(scenario?.title ?? "");
  const [description, setDescription] = useState(scenario?.description ?? "");
  const [productId, setProductId] = useState(scenario?.productId ?? "");
  const [scenarioCategory, setScenarioCategory] = useState<"新規" | "既存" | "">(scenario?.scenarioCategory ?? "");
  const [targetSegment, setTargetSegment] = useState(scenario?.targetSegment ?? "");
  const [customerRole, setCustomerRole] = useState(scenario?.customerRole ?? "");
  const [customerProfile, setCustomerProfile] = useState(scenario?.customerProfile ?? "");
  const [goal, setGoal] = useState(scenario?.goal ?? "");
  const [objections, setObjections] = useState((scenario?.objections ?? []).join("\n"));
  const [criteria, setCriteria] = useState((scenario?.evaluationCriteria ?? []).join("\n"));
  const [difficulty, setDifficulty] = useState<RoleplayDifficulty>(scenario?.difficulty ?? "normal");
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const selectedProduct = products.find((product) => product.id === productId);

  async function handleGenerate() {
    if (!selectedProduct || !scenarioCategory) {
      onError("AI生成には商材、カテゴリーを選択してください。");
      return;
    }

    setIsGenerating(true);
    onError(null);
    try {
      const generated = await generateRoleplayScenario({
        companyId,
        product: selectedProduct,
        category: scenarioCategory,
        targetSegment,
      });
      setTitle(generated.title);
      setDescription(generated.description);
      setTargetSegment(generated.targetSegment);
      setCustomerRole(generated.customerRole);
      setCustomerProfile(generated.customerProfile);
      setGoal(generated.goal);
      setObjections(generated.objections.join("\n"));
      setCriteria(generated.evaluationCriteria.join("\n"));
      setDifficulty(generated.difficulty);
    } catch (nextError) {
      onError(nextError instanceof Error ? nextError.message : "AI生成に失敗しました。");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProduct || !scenarioCategory || !goal.trim()) {
      onError("商材、カテゴリー、練習ゴールを入力してください。");
      return;
    }

    setIsSaving(true);
    onError(null);
    try {
      const payload = {
        companyId,
        title: title.trim() || `${selectedProduct.name} ${scenarioCategory}ロープレ`,
        description: description.trim(),
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        scenarioCategory,
        targetSegment: targetSegment.trim(),
        customerRole: customerRole.trim() || "担当者",
        customerProfile: customerProfile.trim(),
        goal: goal.trim(),
        objections: splitLines(objections),
        evaluationCriteria: splitLines(criteria),
        difficulty,
        visibility: scenario?.visibility ?? "draft",
        createdBy: userId,
      };
      if (scenario) {
        await updateRoleplayScenario(scenario.id, payload);
      } else {
        await createRoleplayScenario(payload);
      }
      onCreated();
    } catch (nextError) {
      onError(nextError instanceof Error ? nextError.message : "シナリオの作成に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#171717]/24 px-4 py-6">
      <form onSubmit={handleSubmit} className="max-h-[92vh] w-full max-w-[760px] overflow-y-auto rounded-[24px] border border-[#eceef4] bg-white p-6 shadow-[0_24px_70px_rgba(17,24,39,0.18)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[24px] font-black tracking-[-0.03em] text-[#171717]">{scenario ? "シナリオ編集" : "管理者シナリオ作成"}</h2>
            <p className="mt-1 text-[13px] leading-6 text-[#7a808c]">商材・カテゴリーからAI生成し、ターゲット層もAIに選ばせられます。</p>
          </div>
          <button type="button" onClick={onClose} className="text-[24px] leading-none text-[#9aa1ac]" aria-label="閉じる">
            ×
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="商材" required>
            <select value={productId} onChange={(event) => setProductId(event.target.value)} className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] text-[#171717] outline-none transition focus:border-[#e0bd4b]">
              <option value="">商材を選択</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </select>
          </Field>
          <Field label="カテゴリー" required>
            <select value={scenarioCategory} onChange={(event) => setScenarioCategory(event.target.value as "新規" | "既存" | "")} className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] text-[#171717] outline-none transition focus:border-[#e0bd4b]">
              <option value="">選択してください</option>
              <option value="新規">新規</option>
              <option value="既存">既存</option>
            </select>
          </Field>
          <Field label="ターゲット層">
            <input value={targetSegment} onChange={(event) => setTargetSegment(event.target.value)} className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] text-[#171717] outline-none transition focus:border-[#e0bd4b]" placeholder="空欄ならAIが選定" />
          </Field>
          <div className="flex items-end">
            <button type="button" onClick={() => void handleGenerate()} disabled={isGenerating} className="h-12 w-full rounded-[14px] border border-[#171717] bg-[#171717] px-4 text-[13px] font-black text-white disabled:opacity-60">
              {isGenerating ? "生成中" : "AIでシナリオ生成"}
            </button>
          </div>
          <Field label="タイトル" className="md:col-span-2">
            <input value={title} onChange={(event) => setTitle(event.target.value)} className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] text-[#171717] outline-none transition focus:border-[#e0bd4b]" placeholder="例：価格反論を受けた時の切り返し" />
          </Field>
          <Field label="顧客役職">
            <input value={customerRole} onChange={(event) => setCustomerRole(event.target.value)} className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] text-[#171717] outline-none transition focus:border-[#e0bd4b]" placeholder="例：営業部長" />
          </Field>
          <Field label="難易度">
            <select value={difficulty} onChange={(event) => setDifficulty(event.target.value as RoleplayDifficulty)} className="h-12 w-full rounded-[14px] border border-[#e4e8ef] bg-white px-4 text-[14px] text-[#171717] outline-none transition focus:border-[#e0bd4b]">
              <option value="easy">やさしい</option>
              <option value="normal">標準</option>
              <option value="hard">難しい</option>
            </select>
          </Field>
          <Field label="概要" className="md:col-span-2">
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-[88px] w-full resize-y rounded-[14px] border border-[#e4e8ef] bg-white px-4 py-3 text-[14px] leading-7 text-[#171717] outline-none transition focus:border-[#e0bd4b]" placeholder="シナリオの説明" />
          </Field>
          <Field label="顧客プロフィール" className="md:col-span-2">
            <textarea value={customerProfile} onChange={(event) => setCustomerProfile(event.target.value)} className="min-h-[88px] w-full resize-y rounded-[14px] border border-[#e4e8ef] bg-white px-4 py-3 text-[14px] leading-7 text-[#171717] outline-none transition focus:border-[#e0bd4b]" placeholder="業種、課題、検討状況など" />
          </Field>
          <Field label="練習ゴール" required className="md:col-span-2">
            <textarea value={goal} onChange={(event) => setGoal(event.target.value)} className="min-h-[88px] w-full resize-y rounded-[14px] border border-[#e4e8ef] bg-white px-4 py-3 text-[14px] leading-7 text-[#171717] outline-none transition focus:border-[#e0bd4b]" placeholder="例：価格ではなく効果と導入後の成果で納得してもらう" />
          </Field>
          <Field label="想定反論" className="md:col-span-1">
            <textarea value={objections} onChange={(event) => setObjections(event.target.value)} className="min-h-[120px] w-full resize-y rounded-[14px] border border-[#e4e8ef] bg-white px-4 py-3 text-[14px] leading-7 text-[#171717] outline-none transition focus:border-[#e0bd4b]" placeholder={"1行に1つ\n例：料金が高い"} />
          </Field>
          <Field label="採点基準" className="md:col-span-1">
            <textarea value={criteria} onChange={(event) => setCriteria(event.target.value)} className="min-h-[120px] w-full resize-y rounded-[14px] border border-[#e4e8ef] bg-white px-4 py-3 text-[14px] leading-7 text-[#171717] outline-none transition focus:border-[#e0bd4b]" placeholder={"1行に1つ\n例：課題を確認できている"} />
          </Field>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[#e4e8ef] bg-white px-5 text-[14px] font-bold text-[#596273]">
            キャンセル
          </button>
          <button type="submit" disabled={isSaving} className="inline-flex h-11 items-center justify-center rounded-[14px] border border-[#f0c655] bg-[#ffd84d] px-6 text-[14px] font-black text-[#171717] disabled:opacity-60">
            {isSaving ? "保存中" : scenario ? "更新する" : "シナリオ一覧に登録"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, required = false, className = "", children }: { label: string; required?: boolean; className?: string; children: ReactNode }) {
  return (
    <label className={className}>
      <span className="mb-2 block text-[13px] font-bold text-[#343b48]">
        {label}
        {required ? <span className="text-[#e04f4f]"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function splitLines(value: string) {
  return value
    .split(/\r?\n|、|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitGuideLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.replace(/^[-・\d.、)\s]+/, "").trim())
    .filter(Boolean);
}

async function generateRoleplayScenario(input: {
  companyId: string;
  product: KnowledgeProduct;
  category: "新規" | "既存";
  targetSegment: string;
}) {
  const response = await fetch("/api/roleplay/generate-scenario", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      companyId: input.companyId,
      product: input.product,
      category: input.category,
      targetSegment: input.targetSegment,
    }),
  });
  const payload = (await response.json()) as {
    scenario?: {
      title?: string;
      description?: string;
      targetSegment?: string;
      customerRole?: string;
      customerProfile?: string;
      goal?: string;
      objections?: string[];
      evaluationCriteria?: string[];
      difficulty?: RoleplayDifficulty;
    };
    error?: string;
  };
  if (!response.ok || !payload.scenario) {
    throw new Error(payload.error ?? "AI生成に失敗しました。");
  }
  return {
    title: payload.scenario.title ?? "",
    description: payload.scenario.description ?? "",
    targetSegment: payload.scenario.targetSegment ?? "",
    customerRole: payload.scenario.customerRole ?? "",
    customerProfile: payload.scenario.customerProfile ?? "",
    goal: payload.scenario.goal ?? "",
    objections: payload.scenario.objections ?? [],
    evaluationCriteria: payload.scenario.evaluationCriteria ?? [],
    difficulty: payload.scenario.difficulty ?? "normal",
  };
}

function formatDifficulty(value: string) {
  if (value === "easy") return "やさしい";
  if (value === "hard") return "難しい";
  return "標準";
}

function ErrorBox({ message }: { message: string }) {
  return <div className="mt-5 rounded-[16px] border border-[#f4d4d4] bg-[#fff8f8] px-4 py-3 text-[13px] font-medium text-[#b4232a]">{message}</div>;
}
