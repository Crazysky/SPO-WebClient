/**
 * Types Index - Barrel Export
 * Re-exports all types from domain files for backward compatibility
 */

// Protocol types (RDO protocol constants and primitives)
export {
  RDO_PORTS,
  RDO_CONSTANTS,
  RdoVerb,
  RdoAction,
  SessionPhase,
  WORLD_ZONES,
  DIRECTORY_QUERY,
} from './protocol-types';

export type {
  RdoPacket,
  WorldZone,
} from './protocol-types';

// Domain types (business entities)
export {
  SurfaceType,
} from './domain-types';

export type {
  WorldInfo,
  CompanyInfo,
  MapObject,
  MapBuilding,
  MapSegment,
  MapData,
  ChatUser,
  ChatChannel,
  BuildingFocusInfo,
  BuildingCategory,
  BuildingInfo,
  SurfaceData,
  FacilityDimensions,
  ZoneOverlayState,
  BuildingPropertyValue,
  BuildingConnectionData,
  BuildingSupplyData,
  BuildingDetailsResponse,
  SearchMenuCategory,
  TownInfo,
  TycoonProfile,
  RankingCategory,
  RankingEntry,
  RoadDrawingState,
} from './domain-types';

// Message types (WebSocket protocol)
export {
  WsMessageType,
  isWsRequest,
} from './message-types';

export type {
  WsMessage,
  // Request payloads
  WsReqConnectDirectory,
  WsReqLoginWorld,
  WsReqRdoDirect,
  WsReqMapLoad,
  WsReqManageConstruction,
  WsReqSelectCompany,
  WsReqSwitchCompany,
  // Response payloads
  WsRespError,
  WsRespConnectSuccess,
  WsRespLoginSuccess,
  WsRespRdoResult,
  WsRespConstructionSuccess,
  WsRespMapData,
  // Event payloads
  WsEventChatMsg,
  WsEventTycoonUpdate,
  WsEventRdoPush,
  // Chat messages
  WsReqChatGetUsers,
  WsReqChatGetChannels,
  WsReqChatGetChannelInfo,
  WsReqChatJoinChannel,
  WsReqChatSendMessage,
  WsReqChatTypingStatus,
  WsRespChatUserList,
  WsRespChatChannelList,
  WsRespChatChannelInfo,
  WsRespChatSuccess,
  WsEventChatUserTyping,
  WsEventChatChannelChange,
  WsEventChatUserListChange,
  // Building focus messages
  WsReqBuildingFocus,
  WsReqBuildingUnfocus,
  WsRespBuildingFocus,
  WsEventBuildingRefresh,
  // Building construction messages
  WsReqGetBuildingCategories,
  WsReqGetBuildingFacilities,
  WsReqPlaceBuilding,
  WsReqGetSurface,
  WsReqGetAllFacilityDimensions,
  WsRespBuildingCategories,
  WsRespBuildingFacilities,
  WsRespBuildingPlaced,
  WsRespSurfaceData,
  WsRespAllFacilityDimensions,
  // Building details messages
  WsReqBuildingDetails,
  WsRespBuildingDetails,
  WsReqBuildingSetProperty,
  WsRespBuildingSetProperty,
  WsReqBuildingUpgrade,
  WsRespBuildingUpgrade,
  WsReqRenameFacility,
  WsRespRenameFacility,
  WsReqDeleteFacility,
  WsRespDeleteFacility,
  // Search menu messages
  WsReqSearchMenuHome,
  WsRespSearchMenuHome,
  WsReqSearchMenuTowns,
  WsRespSearchMenuTowns,
  WsReqSearchMenuTycoonProfile,
  WsRespSearchMenuTycoonProfile,
  WsReqSearchMenuPeople,
  WsRespSearchMenuPeople,
  WsReqSearchMenuPeopleSearch,
  WsRespSearchMenuPeopleSearch,
  WsReqSearchMenuRankings,
  WsRespSearchMenuRankings,
  WsReqSearchMenuRankingDetail,
  WsRespSearchMenuRankingDetail,
  WsReqSearchMenuBanks,
  WsRespSearchMenuBanks,
  // Road building messages
  WsReqBuildRoad,
  WsRespBuildRoad,
  WsReqGetRoadCost,
  WsRespGetRoadCost,
  // Logout messages
  WsReqLogout,
  WsRespLogout,
} from './message-types';
