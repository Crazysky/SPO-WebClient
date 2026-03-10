import {
  WsMessageType,
  type WsMessage,
  type WsReqPoliticsData,
  type WsRespPoliticsData,
  type WsReqPoliticsVote,
  type WsRespPoliticsVote,
  type WsReqPoliticsLaunchCampaign,
  type WsRespPoliticsLaunchCampaign,
  type WsReqPoliticsCancelCampaign,
  type WsRespPoliticsCancelCampaign,
  type WsReqTycoonRole,
  type WsRespTycoonRole,
} from '../../shared/types';
import type { WsHandlerContext, WsHandler } from './types';
import { sendResponse } from './ws-utils';

export const handlePoliticsData: WsHandler = async (ctx: WsHandlerContext, msg: WsMessage): Promise<void> => {
  const req = msg as WsReqPoliticsData;
  console.log(`[Gateway] Getting politics data for town: ${req.townName}`);
  const data = await ctx.session.getPoliticsData(req.townName, req.buildingX, req.buildingY);
  const response: WsRespPoliticsData = {
    type: WsMessageType.RESP_POLITICS_DATA,
    wsRequestId: msg.wsRequestId,
    data,
  };
  sendResponse(ctx.ws, response);
};

export const handlePoliticsVote: WsHandler = async (ctx: WsHandlerContext, msg: WsMessage): Promise<void> => {
  const req = msg as WsReqPoliticsVote;
  console.log(`[Gateway] Voting for ${req.candidateName}`);
  const result = await ctx.session.politicsVote(req.buildingX, req.buildingY, req.candidateName);
  const response: WsRespPoliticsVote = {
    type: WsMessageType.RESP_POLITICS_VOTE,
    wsRequestId: msg.wsRequestId,
    success: result.success,
    message: result.message,
  };
  sendResponse(ctx.ws, response);
};

export const handlePoliticsLaunchCampaign: WsHandler = async (ctx: WsHandlerContext, msg: WsMessage): Promise<void> => {
  const req = msg as WsReqPoliticsLaunchCampaign;
  console.log(`[Gateway] Launching political campaign`);
  const result = await ctx.session.politicsLaunchCampaign(req.buildingX, req.buildingY, req.townName);
  const response: WsRespPoliticsLaunchCampaign = {
    type: WsMessageType.RESP_POLITICS_LAUNCH_CAMPAIGN,
    wsRequestId: msg.wsRequestId,
    success: result.success,
    message: result.message,
  };
  sendResponse(ctx.ws, response);
};

export const handlePoliticsCancelCampaign: WsHandler = async (ctx: WsHandlerContext, msg: WsMessage): Promise<void> => {
  const req = msg as WsReqPoliticsCancelCampaign;
  console.log(`[Gateway] Cancelling political campaign`);
  const result = await ctx.session.politicsCancelCampaign(req.buildingX, req.buildingY, req.townName);
  const response: WsRespPoliticsCancelCampaign = {
    type: WsMessageType.RESP_POLITICS_CANCEL_CAMPAIGN,
    wsRequestId: msg.wsRequestId,
    success: result.success,
    message: result.message,
  };
  sendResponse(ctx.ws, response);
};

export const handleTycoonRole: WsHandler = async (ctx: WsHandlerContext, msg: WsMessage): Promise<void> => {
  const req = msg as WsReqTycoonRole;
  console.log(`[Gateway] Querying political role for: ${req.tycoonName}`);
  const role = await ctx.session.queryTycoonPoliticalRole(req.tycoonName);
  const response: WsRespTycoonRole = {
    type: WsMessageType.RESP_TYCOON_ROLE,
    wsRequestId: msg.wsRequestId,
    role,
  };
  sendResponse(ctx.ws, response);
};
