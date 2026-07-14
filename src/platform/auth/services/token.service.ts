import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sha256 } from 'src/common/utils/strings.util';
import { eq, and } from 'drizzle-orm';
import { DrizzleService } from 'src/db/drizzle/drizzle.service';
import { apiTokens, users, nodes } from 'src/db/drizzle/schema';

@Injectable()
export class TokenService {
  constructor(
    private configService: ConfigService,
    private drizzleService: DrizzleService,
  ) { }

  async hashToken(token: string): Promise<string> {
    const pepper = this.configService.get('TOKEN_PEPPER');
    return sha256(pepper + token);
  }

  async findUserByToken(token: string): Promise<any | null> {
    const tokenHash = await this.hashToken(token);

    const result = await this.drizzleService.db
      .select({
        userId: apiTokens.userId,
        tokenLabel: apiTokens.label,
      })
      .from(apiTokens)
      .where(eq(apiTokens.tokenHash, tokenHash))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    // Get user details from the main users table
    const userResult = await this.drizzleService.db
      .select({
        id: users.id,
        email: users.email,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        marketingOptIn: users.marketingOptIn,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, result[0].userId))
      .limit(1);

    if (userResult.length === 0) {
      return null;
    }

    // Update last used timestamp
    await this.drizzleService.db
      .update(apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiTokens.tokenHash, tokenHash));

    return userResult[0];
  }

  async findNodeByAgentKey(agentName: string, agentKey: string): Promise<any | null> {
    const agentKeyHash = await this.hashToken(agentKey); // Use same hashing method for agent keys

    const result = await this.drizzleService.db
      .select()
      .from(nodes)
      .where(
        and(
          eq(nodes.name, agentName),
          eq(nodes.agentKeyHash, agentKeyHash)
        )
      )
      .limit(1);

    return result.length > 0 ? result[0] : null;
  }
}