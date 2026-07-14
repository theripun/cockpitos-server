import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { TokenService } from '../services/token.service';

@Injectable()
export class AgentAuthGuard implements CanActivate {
  constructor(private tokenService: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    
    const agentName = request.headers['x-agent-name'] as string;
    const agentKey = request.headers['x-agent-key'] as string;
    
    if (!agentName || !agentKey) {
      return false;
    }

    const node = await this.tokenService.findNodeByAgentKey(agentName, agentKey);
    
    if (!node) {
      return false;
    }

    // Attach node to request
    (request as any).node = node;
    return true;
  }
}