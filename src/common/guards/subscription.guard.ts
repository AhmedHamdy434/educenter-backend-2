import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { SubscriptionValidationService } from '../../modules/subscription-plans/subscription-validation.service';
import { AuthenticatedRequest } from '../../modules/auth/interfaces/authenticated-request.interface';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly subscriptionValidationService: SubscriptionValidationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<
      AuthenticatedRequest & { method?: string }
    >();
    const response = http.getResponse<{
      setHeader?: (name: string, value: string) => void;
      header?: (name: string, value: string) => void;
    }>();
    const user = request.user;

    // If there is no centerId on the request (e.g. SUPER_ADMIN requests), allow through
    if (!user?.centerId) {
      return true;
    }

    const method = (request.method || 'GET').toUpperCase();
    const isReadOnly = ['GET', 'HEAD', 'OPTIONS'].includes(method);

    // Validate subscription access based on HTTP method and grace period
    const validationResult =
      await this.subscriptionValidationService.validateSubscriptionAccess(
        user.centerId,
        isReadOnly,
      );

    if (validationResult.warningHeader && response) {
      if (typeof response.setHeader === 'function') {
        response.setHeader(
          'X-Subscription-Warning',
          validationResult.warningHeader,
        );
      } else if (typeof response.header === 'function') {
        response.header(
          'X-Subscription-Warning',
          validationResult.warningHeader,
        );
      }
    }

    return true;
  }
}
