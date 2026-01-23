/**
 * Unit tests for Road Texture Mapper
 */

import { RoadTopology, RoadSurface } from './road-topology-analyzer';
import { RoadTextureMapper } from './road-texture-mapper';

describe('RoadTextureMapper', () => {
  describe('getTextureFilename - LAND surface', () => {
    it('should return Roadvert.bmp for NS roads', () => {
      expect(RoadTextureMapper.getTextureFilename(RoadTopology.NS_START, RoadSurface.LAND))
        .toBe('Roadvert.bmp');
      expect(RoadTextureMapper.getTextureFilename(RoadTopology.NS_END, RoadSurface.LAND))
        .toBe('Roadvert.bmp');
      expect(RoadTextureMapper.getTextureFilename(RoadTopology.NS_MIDDLE, RoadSurface.LAND))
        .toBe('Roadvert.bmp');
    });

    it('should return Roadhorz.bmp for WE roads', () => {
      expect(RoadTextureMapper.getTextureFilename(RoadTopology.WE_START, RoadSurface.LAND))
        .toBe('Roadhorz.bmp');
      expect(RoadTextureMapper.getTextureFilename(RoadTopology.WE_END, RoadSurface.LAND))
        .toBe('Roadhorz.bmp');
      expect(RoadTextureMapper.getTextureFilename(RoadTopology.WE_MIDDLE, RoadSurface.LAND))
        .toBe('Roadhorz.bmp');
    });

    it('should return Roadcross.bmp for 4-way intersections', () => {
      expect(RoadTextureMapper.getTextureFilename(RoadTopology.XCROSS, RoadSurface.LAND))
        .toBe('Roadcross.bmp');
    });

    it('should return RoadTN.bmp for T-junctions (default)', () => {
      expect(RoadTextureMapper.getTextureFilename(RoadTopology.TCROSS, RoadSurface.LAND))
        .toBe('RoadTN.bmp');
    });

    it('should return RoadcornerE.bmp for corners (default)', () => {
      expect(RoadTextureMapper.getTextureFilename(RoadTopology.TWOCROSS, RoadSurface.LAND))
        .toBe('RoadcornerE.bmp');
    });
  });

  describe('getTextureFilename - URBAN surface', () => {
    it('should return ConcreteRoadvert.bmp for NS roads', () => {
      expect(RoadTextureMapper.getTextureFilename(RoadTopology.NS_MIDDLE, RoadSurface.URBAN))
        .toBe('ConcreteRoadvert.bmp');
    });

    it('should return ConcreteRoadhorz.bmp for WE roads', () => {
      expect(RoadTextureMapper.getTextureFilename(RoadTopology.WE_MIDDLE, RoadSurface.URBAN))
        .toBe('ConcreteRoadhorz.bmp');
    });

    it('should return ConcreteRoadcross.bmp for intersections', () => {
      expect(RoadTextureMapper.getTextureFilename(RoadTopology.XCROSS, RoadSurface.URBAN))
        .toBe('ConcreteRoadcross.bmp');
    });

    it('should return ConcreteRoadTN.bmp for T-junctions', () => {
      expect(RoadTextureMapper.getTextureFilename(RoadTopology.TCROSS, RoadSurface.URBAN))
        .toBe('ConcreteRoadTN.bmp');
    });

    it('should return ConcreteRoadcornerE.bmp for corners', () => {
      expect(RoadTextureMapper.getTextureFilename(RoadTopology.TWOCROSS, RoadSurface.URBAN))
        .toBe('ConcreteRoadcornerE.bmp');
    });
  });

  describe('getTextureFilename - BRIDGE surfaces', () => {
    it('should return RoadhorzBridgeCenter.bmp for water center', () => {
      expect(RoadTextureMapper.getTextureFilename(RoadTopology.WE_MIDDLE, RoadSurface.BRIDGE_WATER_CENTER))
        .toBe('RoadhorzBridgeCenter.bmp');
    });

    it('should return correct bridge texture for each water direction', () => {
      const topology = RoadTopology.NS_MIDDLE;

      expect(RoadTextureMapper.getTextureFilename(topology, RoadSurface.BRIDGE_WATER_N))
        .toBe('RoadvertBridgeN.bmp');
      expect(RoadTextureMapper.getTextureFilename(topology, RoadSurface.BRIDGE_WATER_E))
        .toBe('RoadvertBridgeE.bmp');
      expect(RoadTextureMapper.getTextureFilename(topology, RoadSurface.BRIDGE_WATER_NE))
        .toBe('RoadvertBridgeNE.bmp');
      expect(RoadTextureMapper.getTextureFilename(topology, RoadSurface.BRIDGE_WATER_S))
        .toBe('RoadvertBridgeS.bmp');
      expect(RoadTextureMapper.getTextureFilename(topology, RoadSurface.BRIDGE_WATER_SW))
        .toBe('RoadvertBridgeSW.bmp');
      expect(RoadTextureMapper.getTextureFilename(topology, RoadSurface.BRIDGE_WATER_W))
        .toBe('RoadvertBridgeW.bmp');
      expect(RoadTextureMapper.getTextureFilename(topology, RoadSurface.BRIDGE_WATER_SE))
        .toBe('RoadvertBridgeSE.bmp');
      expect(RoadTextureMapper.getTextureFilename(topology, RoadSurface.BRIDGE_WATER_NW))
        .toBe('RoadvertBridgeNW.bmp');
    });
  });

  describe('getTextureFilename - SMOOTH surface', () => {
    it('should return RoadhorzSmooth.bmp for smooth roads', () => {
      expect(RoadTextureMapper.getTextureFilename(RoadTopology.WE_MIDDLE, RoadSurface.SMOOTH))
        .toBe('RoadhorzSmooth.bmp');
    });

    it('should return RoadcornerESmooth.bmp for smooth corners', () => {
      expect(RoadTextureMapper.getTextureFilename(RoadTopology.TWOCROSS, RoadSurface.SMOOTH))
        .toBe('RoadcornerESmooth.bmp');
    });
  });

  describe('getTJunctionTextureName', () => {
    it('should return TS for missing North (opens to South)', () => {
      expect(RoadTextureMapper.getTJunctionTextureName(false, true, true, true))
        .toBe('TS');
    });

    it('should return TW for missing East (opens to West)', () => {
      expect(RoadTextureMapper.getTJunctionTextureName(true, false, true, true))
        .toBe('TW');
    });

    it('should return TN for missing South (opens to North)', () => {
      expect(RoadTextureMapper.getTJunctionTextureName(true, true, false, true))
        .toBe('TN');
    });

    it('should return TE for missing West (opens to East)', () => {
      expect(RoadTextureMapper.getTJunctionTextureName(true, true, true, false))
        .toBe('TE');
    });
  });

  describe('getCornerTextureName', () => {
    it('should return cornerE for North-East connections', () => {
      expect(RoadTextureMapper.getCornerTextureName(true, true, false, false))
        .toBe('cornerE');
    });

    it('should return cornerS for East-South connections', () => {
      expect(RoadTextureMapper.getCornerTextureName(false, true, true, false))
        .toBe('cornerS');
    });

    it('should return cornerW for South-West connections', () => {
      expect(RoadTextureMapper.getCornerTextureName(false, false, true, true))
        .toBe('cornerW');
    });

    it('should return cornerN for West-North connections', () => {
      expect(RoadTextureMapper.getCornerTextureName(true, false, false, true))
        .toBe('cornerN');
    });
  });

  describe('getTextureFilenameWithNeighbors', () => {
    it('should use neighbor analysis for T-junctions', () => {
      // T-junction opening to South (no North connection)
      const filename = RoadTextureMapper.getTextureFilenameWithNeighbors(
        RoadTopology.TCROSS,
        RoadSurface.LAND,
        false, true, true, true
      );
      expect(filename).toBe('RoadTS.bmp');
    });

    it('should use neighbor analysis for corners', () => {
      // Corner turning towards East (North-East connections)
      const filename = RoadTextureMapper.getTextureFilenameWithNeighbors(
        RoadTopology.TWOCROSS,
        RoadSurface.LAND,
        true, true, false, false
      );
      expect(filename).toBe('RoadcornerE.bmp');
    });

    it('should work with urban surface', () => {
      const filename = RoadTextureMapper.getTextureFilenameWithNeighbors(
        RoadTopology.TCROSS,
        RoadSurface.URBAN,
        true, true, false, true  // Missing South, opens to North
      );
      expect(filename).toBe('ConcreteRoadTN.bmp');
    });

    it('should work with bridge surface', () => {
      const filename = RoadTextureMapper.getTextureFilenameWithNeighbors(
        RoadTopology.TWOCROSS,
        RoadSurface.BRIDGE_WATER_CENTER,
        false, true, true, false  // East-South corner
      );
      expect(filename).toBe('RoadcornerSBridgeCenter.bmp');
    });
  });

  describe('getFallbackTexture', () => {
    it('should remove Bridge modifier', () => {
      expect(RoadTextureMapper.getFallbackTexture('RoadhorzBridgeN.bmp'))
        .toBe('Roadhorz.bmp');
      expect(RoadTextureMapper.getFallbackTexture('RoadvertBridgeCenter.bmp'))
        .toBe('Roadvert.bmp');
    });

    it('should remove Smooth modifier', () => {
      expect(RoadTextureMapper.getFallbackTexture('RoadhorzSmooth.bmp'))
        .toBe('Roadhorz.bmp');
    });

    it('should remove ConcreteRoad prefix', () => {
      expect(RoadTextureMapper.getFallbackTexture('ConcreteRoadhorz.bmp'))
        .toBe('Roadhorz.bmp');
      expect(RoadTextureMapper.getFallbackTexture('ConcreteRoadcross.bmp'))
        .toBe('Roadcross.bmp');
    });

    it('should return unchanged for base textures', () => {
      expect(RoadTextureMapper.getFallbackTexture('Roadhorz.bmp'))
        .toBe('Roadhorz.bmp');
      expect(RoadTextureMapper.getFallbackTexture('Roadvert.bmp'))
        .toBe('Roadvert.bmp');
    });
  });

  describe('NONE topology', () => {
    it('should return empty string for NONE topology', () => {
      expect(RoadTextureMapper.getTextureFilename(RoadTopology.NONE, RoadSurface.LAND))
        .toBe('');
    });
  });

  describe('diagonal roads (NWSE, NESW)', () => {
    it('should fall back to vert for NWSE roads', () => {
      expect(RoadTextureMapper.getTextureFilename(RoadTopology.NWSE_START, RoadSurface.LAND))
        .toBe('Roadvert.bmp');
      expect(RoadTextureMapper.getTextureFilename(RoadTopology.NWSE_MIDDLE, RoadSurface.LAND))
        .toBe('Roadvert.bmp');
    });

    it('should fall back to horz for NESW roads', () => {
      expect(RoadTextureMapper.getTextureFilename(RoadTopology.NESW_START, RoadSurface.LAND))
        .toBe('Roadhorz.bmp');
      expect(RoadTextureMapper.getTextureFilename(RoadTopology.NESW_MIDDLE, RoadSurface.LAND))
        .toBe('Roadhorz.bmp');
    });
  });
});
