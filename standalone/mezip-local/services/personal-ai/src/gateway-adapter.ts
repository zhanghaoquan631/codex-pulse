import { createHash } from 'node:crypto';

import { AiGatewayError } from '@me-zip/ai-gateway';
import type { AiGatewayService } from '@me-zip/ai-gateway';
import type { AiGatewayInvocation } from '@me-zip/shared-types';

import {
  PersonalAIError,
  type PersonalAIGenerationGateway,
  type PersonalAIGenerationInput,
  type PersonalAIGenerationResult,
} from './personal-ai.js';

function idempotencyKey(input: PersonalAIGenerationInput): string {
  return `personal-ai:${createHash('sha256').update(`${input.principal.userId}:${input.question}:${input.evidence.map((item) => item.citationId).join(',')}`).digest('hex').slice(0, 48)}`;
}

/** Server-only bridge from Personal AI to the Phase 8 Gateway. It sends only
 * explicitly authorized evidence and never exposes a provider credential or a
 * client-selected owner. The Gateway remains responsible for entitlement,
 * quota, rate limit, and provider policy checks. */
export class AiGatewayPersonalAIGenerationGateway implements PersonalAIGenerationGateway {
  public readonly phase8Gateway = true as const;
  public constructor(private readonly gateway: AiGatewayService, private readonly modelCode = 'LOCAL_ECHO_V1') {}

  public generate(input: PersonalAIGenerationInput): PersonalAIGenerationResult {
    const started = Date.now();
    const evidence = input.evidence.map((item) => `[${item.displayTitle} · ${item.occurredAt}] ${item.excerptSafe}`).join('\n');
    const prompt = [
      `Archive mode: ${input.archiveMode}`,
      'Answer only from the explicitly authorized archive evidence below.',
      `Question: ${input.question}`,
      evidence.length === 0 ? 'No archive evidence was retrieved.' : `Evidence:\n${evidence}`,
    ].join('\n');
    let invocation: AiGatewayInvocation;
    try {
      invocation = this.gateway.createInvocation(input.principal, {
        modelCode: this.modelCode,
        capabilityCode: 'TEXT',
        messages: [{ role: 'USER', content: prompt }],
        stream: false,
        context: { scope: 'NONE' },
      }, idempotencyKey(input));
      if (invocation.status === 'QUEUED') invocation = this.gateway.runPendingInvocation(invocation.id) as AiGatewayInvocation;
    } catch (error) {
      if (error instanceof AiGatewayError) throw new PersonalAIError('PROVIDER_UNAVAILABLE', 'The Personal AI generation gateway is unavailable.');
      throw error;
    }
    if (invocation.status !== 'SUCCEEDED' || invocation.outputText === null) throw new PersonalAIError('PROVIDER_UNAVAILABLE', 'The Personal AI generation gateway did not return an answer.');
    return {
      answerText: invocation.outputText,
      modelCode: invocation.modelCode,
      providerCode: invocation.providerCode,
      inputTokens: invocation.metering?.inputTokens ?? 0,
      outputTokens: invocation.metering?.outputTokens ?? 0,
      costFen: invocation.metering?.costFen ?? 0,
      latencyMs: invocation.latencyMs ?? Date.now() - started,
    };
  }
}
