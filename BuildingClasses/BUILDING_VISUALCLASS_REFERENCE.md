# Complete Building VisualClass Reference

## Understanding the VisualClass System

### Formula
```
VisualClass (at runtime) = BaseVisualClass + sum(Stage[i].VisualStages for i < CurrentStage) + CurrentBlock.VisualClassId
```

### Standard 2-Stage Building
| Stage | Name | Calculation | Result |
|-------|------|-------------|--------|
| 0 | Construction | Base + 0 | **Base** |
| 1 | Complete | Base + Stage0.VisualStages | **Base + VS0** |

**Default VisualStages = 1** (set in TMetaBlock constructor at Kernel.pas:3412)

### Texture Naming Convention
- **Construction**: `Construction[PixelSize].gif` (e.g., Construction64.gif, Construction128.gif)
- **Complete Building**: `Map[Cluster][BuildingType]64x32x0.gif`
- **Empty Residential**: `Map[Cluster][ResType][Variant]Empty64x32x0.gif`

### Cluster Prefixes
| Cluster | Prefix |
|---------|--------|
| PGI | MapPGI |
| Mariko | MapMKO |
| Dissidents | MapDis |
| Moab | MapMoab |
| Magna | MapMagna |
| UW | MapUW |

---

## PGI CLUSTER

### Headquarters & Special
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|
| PGITownHall | 4500 | 1 | 4500 | 4501 | 2 | 2 | Construction64.gif | MapPGITownHall64x32x0.gif |
| PGITradeCenter | 4510 | 1 | 4510 | 4511 | 2 | 2 | Construction64.gif | MapPGITradeCenter64x32x0.gif |
| PGIGeneralHeadquarter | 4901 | 1 | 4901 | 4902 | 2 | 2 | Construction64.gif | MapPGIGenHQ64x32x0.gif |
| PGIIndHeadquarter | 4911 | 1 | 4911 | 4912 | 2 | 2 | Construction64.gif | MapPGIIndHQ64x32x0.gif |
| PGIServiceHeadquarter | 4911 | 1 | 4911 | 4912 | 2 | 2 | Construction64.gif | MapPGIServHQ64x32x0.gif |
| PGIResHeadquarter | 4911 | 1 | 4911 | 4912 | 2 | 2 | Construction64.gif | MapPGIResHQ64x32x0.gif |
| PGIPubHeadquarter | 4911 | 1 | 4911 | 4912 | 2 | 2 | Construction64.gif | MapPGIPubHQ64x32x0.gif |

### Residential - Low Cost (VisualStages=1)
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture | Empty Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|---------------|
| PGIHighClassLoCost | 4451 | 1 | 4451 | 4452 | 2 | 2 | Construction64.gif | MapPGILoCostHiRes64x32x0.gif | MapPGILoCostHiResEmpty64x32x0.gif |
| PGIMiddleClassLoCost | 4461 | 1 | 4461 | 4462 | 2 | 2 | Construction64.gif | MapPGILoCostMiRes64x32x0.gif | MapPGILoCostMiResEmpty64x32x0.gif |
| PGILowClassLoCost | 4471 | 1 | 4471 | 4472 | 2 | 2 | Construction64.gif | MapPGILoCostLoRes64x32x0.gif | MapPGILoCostLoResEmpty64x32x0.gif |

### Residential - High Class (VisualStages=2)
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture | Empty Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|---------------|
| PGIHighClassBuildingA | 4301 | 2 | 4301 | 4303 | 2 | 2 | Construction64.gif | MapPGIHiResA64x32x0.gif | MapPGIHiResAEmpty64x32x0.gif |
| PGIHighClassBuildingB | 4311 | 2 | 4311 | 4313 | 2 | 2 | Construction64.gif | MapPGIHiResB64x32x0.gif | MapPGIHiResBEmpty64x32x0.gif |
| PGIHighClassBuildingC | 4321 | 2 | 4321 | 4323 | 2 | 2 | Construction64.gif | MapPGIHiResC64x32x0.gif | MapPGIHiResCEmpty64x32x0.gif |
| PGIHighClassBuildingD | 4331 | 2 | 4331 | 4333 | 2 | 2 | Construction64.gif | MapPGIHiResD64x32x0.gif | MapPGIHiResDEmpty64x32x0.gif |
| PGIHighClassBuildingE | 4341 | 2 | 4341 | 4343 | 4 | 4 | Construction192.gif | MapPGIHiResE64x32x0.gif | MapPGIHiResEEmpty64x32x0.gif |
| PGIHighClassBuildingF | 4481 | 2 | 4481 | 4483 | 2 | 2 | Construction64.gif | MapPGIHiResF64x32x0.gif | MapPGIHiResFEmpty64x32x0.gif |
| PGIHighClassBuildingG | 7511 | 2 | 7511 | 7513 | 2 | 2 | Construction64.gif | MapPGIHiResG64x32x0.gif | MapPGIHiResGEmpty64x32x0.gif |
| PGIHighClassBuildingH | 7521 | 2 | 7521 | 7523 | 2 | 2 | Construction64.gif | MapPGIHiResH64x32x0.gif | MapPGIHiResHEmpty64x32x0.gif |
| PGIHighClassBuildingI | 7531 | 2 | 7531 | 7533 | 2 | 2 | Construction64.gif | MapPGIHiResI64x32x0.gif | MapPGIHiResIEmpty64x32x0.gif |
| PGIHighClassBuildingJ | 7501 | 2 | 7501 | 7503 | 2 | 2 | Construction64.gif | MapPGIHiResJ64x32x0.gif | MapPGIHiResJEmpty64x32x0.gif |

### Residential - Middle Class (VisualStages=2)
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture | Empty Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|---------------|
| PGIMiddleClassBuildingA | 4351 | 2 | 4351 | 4353 | 2 | 2 | Construction64.gif | MapPGIMiResA64x32x0.gif | MapPGIMiResAEmpty64x32x0.gif |
| PGIMiddleClassBuildingB | 4361 | 2 | 4361 | 4363 | 2 | 2 | Construction64.gif | MapPGIMiResB64x32x0.gif | MapPGIMiResBEmpty64x32x0.gif |
| PGIMiddleClassBuildingC | 4371 | 2 | 4371 | 4373 | 2 | 2 | Construction64.gif | MapPGIMiResC64x32x0.gif | MapPGIMiResCEmpty64x32x0.gif |
| PGIMiddleClassBuildingD | 4381 | 2 | 4381 | 4383 | 2 | 2 | Construction64.gif | MapPGIMiResD64x32x0.gif | MapPGIMiResDEmpty64x32x0.gif |
| PGIMiddleClassBuildingE | 4391 | 2 | 4391 | 4393 | 3 | 3 | Construction128.gif | MapPGIMiResE64x32x0.gif | MapPGIMiResEEmpty64x32x0.gif |

### Residential - Low Class (VisualStages=2)
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture | Empty Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|---------------|
| PGILowClassBuildingA | 4401 | 2 | 4401 | 4403 | 2 | 2 | Construction64.gif | MapPGILoResA64x32x0.gif | MapPGILoResAEmpty64x32x0.gif |
| PGILowClassBuildingB | 4411 | 2 | 4411 | 4413 | 2 | 2 | Construction64.gif | MapPGILoResB64x32x0.gif | MapPGILoResBEmpty64x32x0.gif |
| PGILowClassBuildingC | 4421 | 2 | 4421 | 4423 | 2 | 2 | Construction64.gif | MapPGILoResC64x32x0.gif | MapPGILoResCEmpty64x32x0.gif |
| PGILowClassBuildingD | 4431 | 2 | 4431 | 4433 | 2 | 2 | Construction64.gif | MapPGILoResD64x32x0.gif | MapPGILoResDEmpty64x32x0.gif |
| PGILowClassBuildingE | 7541 | 2 | 7541 | 7543 | 2 | 2 | Construction64.gif | MapPGILoResE64x32x0.gif | MapPGILoResEEmpty64x32x0.gif |
| PGILowClassBuildingF | 7551 | 2 | 7551 | 7553 | 2 | 2 | Construction64.gif | MapPGILoResF64x32x0.gif | MapPGILoResFEmpty64x32x0.gif |

### Office Buildings (VisualStages=2)
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|
| PGIOfficeBuildingA | 4951 | 2 | 4951 | 4953 | 2 | 2 | Construction64.gif | MapPGIOfficeA64x32x0.gif |
| PGIOfficeBuildingB | 4961 | 2 | 4961 | 4963 | 2 | 2 | Construction64.gif | MapPGIOfficeB64x32x0.gif |
| PGIOfficeBuildingC | 4971 | 2 | 4971 | 4973 | 2 | 2 | Construction64.gif | MapPGIOfficeC64x32x0.gif |
| PGIOfficeBuildingD | 7561 | 2 | 7561 | 7563 | 2 | 2 | Construction64.gif | MapPGIOfficeD64x32x0.gif |

### Industries (VisualStages=1)
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|
| PGIFarm | 4111 | 1 | 4111 | 4112 | 5 | 5 | Construction256.gif | MapPGIFarm64x32x0.gif |
| PGISmallFarm | 4115 | 1 | 4115 | 4116 | 3 | 3 | Construction128.gif | MapPGISmallFarm64x32x0.gif |
| PGIMine | 4121 | 1 | 4121 | 4122 | 5 | 5 | Construction256.gif | MapPGIMine64x32x0.gif |
| PGISmallMine | 4125 | 1 | 4125 | 4126 | 3 | 3 | Construction128.gif | MapPGISmallMine64x32x0.gif |
| PGIChemMine | 7311 | 1 | 7311 | 7312 | 5 | 5 | Construction256.gif | MapPGIChemMine64x32x0.gif |
| PGISmallChemMine | 7315 | 1 | 7315 | 7316 | 3 | 3 | Construction128.gif | MapPGISmallChemMine64x32x0.gif |
| PGISiliconMine | 7321 | 1 | 7321 | 7322 | 5 | 5 | Construction256.gif | MapPGISiliconMine64x32x0.gif |
| PGISmallSiliconMine | 7325 | 1 | 7325 | 7326 | 3 | 3 | Construction128.gif | MapPGISmallSiliconMine64x32x0.gif |
| PGIStoneMine | 7331 | 1 | 7331 | 7332 | 5 | 5 | Construction256.gif | MapPGIStoneMine64x32x0.gif |
| PGISmallStoneMine | 7335 | 1 | 7335 | 7336 | 3 | 3 | Construction128.gif | MapPGISmallStoneMine64x32x0.gif |
| PGICoalMine | 7341 | 1 | 7341 | 7342 | 5 | 5 | Construction256.gif | MapPGICoalMine64x32x0.gif |
| PGISmallCoalMine | 7345 | 1 | 7345 | 7346 | 3 | 3 | Construction128.gif | MapPGISmallCoalMine64x32x0.gif |
| PGIClothings | 4131 | 1 | 4131 | 4132 | 5 | 5 | Construction256.gif | MapPGIClothingIndustry64x32x0.gif |
| PGISmallClothings | 4135 | 1 | 4135 | 4136 | 3 | 3 | Construction128.gif | MapPGISmallClothing64x32x0.gif |
| PGIFoodProc | 4141 | 1 | 4141 | 4142 | 5 | 5 | Construction256.gif | MapPGIFoodProc64x32x0.gif |
| PGISmallFoodProc | 4145 | 1 | 4145 | 4146 | 3 | 3 | Construction128.gif | MapPGISmallFoodProc64x32x0.gif |
| PGIMetal | 4151 | 1 | 4151 | 4152 | 5 | 5 | Construction256.gif | MapPGIMetal64x32x0.gif |
| PGISmallMetal | 4155 | 1 | 4155 | 4156 | 3 | 3 | Construction128.gif | MapPGISmallMetal64x32x0.gif |
| PGIChemical | 4161 | 1 | 4161 | 4162 | 5 | 5 | Construction256.gif | MapPGIChemical64x32x0.gif |
| PGISmallChemical | 4165 | 1 | 4165 | 4166 | 3 | 3 | Construction128.gif | MapPGISmallChemical64x32x0.gif |
| PGIPaper | 7571 | 1 | 7571 | 7572 | 5 | 5 | Construction256.gif | MapPGIPaper64x32x0.gif |
| PGIPrinting | 7581 | 1 | 7581 | 7582 | 5 | 5 | Construction256.gif | MapPGIPrinting64x32x0.gif |
| PGITextile | 4171 | 1 | 4171 | 4172 | 5 | 5 | Construction256.gif | MapPGITextile64x32x0.gif |
| PGISmallTextile | 4175 | 1 | 4175 | 4176 | 3 | 3 | Construction128.gif | MapPGISmallTextile64x32x0.gif |
| PGIElectronic | 4181 | 1 | 4181 | 4182 | 5 | 5 | Construction256.gif | MapPGIElectronic64x32x0.gif |
| PGISmallElectronic | 4185 | 1 | 4185 | 4186 | 3 | 3 | Construction128.gif | MapPGISmallElectronic64x32x0.gif |
| PGICarIndustry | 4191 | 1 | 4191 | 4192 | 5 | 5 | Construction256.gif | MapPGICarIndustry64x32x0.gif |
| PGISmallCarIndustry | 4195 | 1 | 4195 | 4196 | 3 | 3 | Construction128.gif | MapPGISmallCarIndustry64x32x0.gif |
| PGIHeavy | 4201 | 1 | 4201 | 4202 | 5 | 5 | Construction256.gif | MapPGIHeavy64x32x0.gif |
| PGISmallHeavy | 4205 | 1 | 4205 | 4206 | 3 | 3 | Construction128.gif | MapPGISmallHeavy64x32x0.gif |
| PGIConstruction | 4211 | 1 | 4211 | 4212 | 5 | 5 | Construction256.gif | MapPGIConstruction64x32x0.gif |
| PGIComputingIndustry | 4221 | 1 | 4221 | 4222 | 5 | 5 | Construction256.gif | MapPGIComputingIndustry64x32x0.gif |
| PGIHHAIndustry | 4231 | 1 | 4231 | 4232 | 5 | 5 | Construction256.gif | MapPGIHHAIndustry64x32x0.gif |
| PGISmallHHAIndustry | 4235 | 1 | 4235 | 4236 | 3 | 3 | Construction128.gif | MapPGISmallHHAIndustry64x32x0.gif |
| PGILegalServices | 4241 | 1 | 4241 | 4242 | 5 | 5 | Construction256.gif | MapPGILegalServices64x32x0.gif |
| PGIBM | 4251 | 1 | 4251 | 4252 | 5 | 5 | Construction256.gif | MapPGIBM64x32x0.gif |
| PGISmallBM | 4255 | 1 | 4255 | 4256 | 3 | 3 | Construction128.gif | MapPGISmallBM64x32x0.gif |
| PGIPharmaIndustry | 4271 | 1 | 4271 | 4272 | 5 | 5 | Construction256.gif | MapPGIPharmaIndustry64x32x0.gif |

### Commerce (VisualStages=1)
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|
| PGIFoodStore | 4601 | 1 | 4601 | 4602 | 2 | 2 | Construction64.gif | MapPGIFoodStore64x32x0.gif |
| PGIClothesStore | 4631 | 1 | 4631 | 4632 | 2 | 2 | Construction64.gif | MapPGIClothesStore64x32x0.gif |
| PGIHHAsStore | 4661 | 1 | 4661 | 4662 | 2 | 2 | Construction64.gif | MapPGIHHAStore64x32x0.gif |
| PGICarStore | 4691 | 1 | 4691 | 4692 | 2 | 2 | Construction64.gif | MapPGICarStore64x32x0.gif |
| **PGIDrugStore** | **4701** | **1** | **4701** | **4702** | **2** | **2** | **Construction64.gif** | **MapPGIDrugStore64x32x0.gif** |
| PGISupermarketA | 4721 | 1 | 4721 | 4722 | 3 | 3 | Construction128.gif | MapPGISupermarketA64x32x0.gif |
| PGISupermarketB | 4731 | 1 | 4731 | 4732 | 3 | 3 | Construction128.gif | MapPGISupermarketB64x32x0.gif |
| PGISupermarketC | 4741 | 1 | 4741 | 4742 | 3 | 3 | Construction128.gif | MapPGISupermarketC64x32x0.gif |
| PGIBar | 4751 | 1 | 4751 | 4752 | 2 | 2 | Construction64.gif | MapPGIBar64x32x0.gif |
| PGIRestaurant | 4771 | 1 | 4771 | 4772 | 2 | 2 | Construction64.gif | MapPGIRestaurant64x32x0.gif |
| PGIMovieA | 4781 | 1 | 4781 | 4782 | 3 | 3 | Construction128.gif | MapPGIMovieA64x32x0.gif |
| PGIMovieB | 4791 | 1 | 4791 | 4792 | 3 | 3 | Construction128.gif | MapPGIMovieB64x32x0.gif |

### Public Services (VisualStages=1)
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|
| PGIHospital | 4801 | 1 | 4801 | 4802 | 2 | 2 | Construction64.gif | MapPGIHospital64x32x0.gif |
| PGISchool | 4811 | 1 | 4811 | 4812 | 2 | 2 | Construction64.gif | MapPGISchool64x32x0.gif |
| PGIPolice | 4821 | 1 | 4821 | 4822 | 2 | 2 | Construction64.gif | MapPGIPolice64x32x0.gif |
| PGIFire | 4831 | 1 | 4831 | 4832 | 2 | 2 | Construction64.gif | MapPGIFire64x32x0.gif |

### Parks (VisualStages=1)
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|
| PGISmallPark | 2831 | 1 | 2831 | 2832 | 5 | 5 | Construction256.gif | MapSmallPark64x32x0.gif |
| PGIMediumPark | 2841 | 1 | 2841 | 2842 | 7 | 7 | Construction320.gif | MapMediumPark64x32x0.gif |
| PGICentralPark | 2851 | 1 | 2851 | 2852 | 9 | 9 | Construction320.gif | MapCentralPark64x32x0.gif |

### TV & Landmarks
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|
| PGITVStation | 4981 | 1 | 4981 | 4982 | 2 | 2 | Construction64.gif | MapPGITVStation64x32x0.gif |
| PGITVAntenna | 4991 | 1 | 4991 | 4992 | 2 | 2 | Construction64.gif | MapPGITVAntenna64x32x0.gif |
| PGILiberty | 6011 | 5 | 6011 | 6016 | 4 | 4 | Construction192.gif | MapLiberty64x32x0.gif |
| PGITower | 6021 | 5 | 6021 | 6026 | 4 | 4 | Construction192.gif | MapTower64x32x0.gif |

---

## MARIKO CLUSTER

### Headquarters & Special
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|
| MarikoTownHall | 3500 | 1 | 3500 | 3501 | 2 | 2 | Construction64.gif | MapMKOTownHall64x32x0.gif |
| MarikoTradeCenter | 3510 | 1 | 3510 | 3511 | 2 | 2 | Construction64.gif | MapMKOTradeCenter64x32x0.gif |
| MarikoGeneralHeadquarter | 3901 | 1 | 3901 | 3902 | 2 | 2 | Construction64.gif | MapMKOGenHQ64x32x0.gif |
| MarikoIndHeadquarter | 3911 | 1 | 3911 | 3912 | 2 | 2 | Construction64.gif | MapMKOIndHQ64x32x0.gif |
| MarikoServiceHeadquarter | 3911 | 1 | 3911 | 3912 | 2 | 2 | Construction64.gif | MapMKOServHQ64x32x0.gif |
| MarikoResHeadquarter | 3911 | 1 | 3911 | 3912 | 2 | 2 | Construction64.gif | MapMKOResHQ64x32x0.gif |
| MarikoPubHeadquarter | 3911 | 1 | 3911 | 3912 | 2 | 2 | Construction64.gif | MapMKOPubHQ64x32x0.gif |

### Residential - Low Cost (VisualStages=1)
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture | Empty Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|---------------|
| MarikoHighClassLoCost | 3451 | 1 | 3451 | 3452 | 2 | 2 | Construction64.gif | MapMKOLoCostHiRes64x32x0.gif | MapMKOLoCostHiResEmpty64x32x0.gif |
| MarikoMiddleClassLoCost | 3461 | 1 | 3461 | 3462 | 2 | 2 | Construction64.gif | MapMKOLoCostMiRes64x32x0.gif | MapMKOLoCostMiResEmpty64x32x0.gif |
| MarikoLowClassLoCost | 3471 | 1 | 3471 | 3472 | 1 | 1 | Construction32.gif | MapMKOLoCostLoRes64x32x0.gif | MapMKOLoCostLoResEmpty64x32x0.gif |

### Residential - High Class (VisualStages=2)
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture | Empty Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|---------------|
| MarikoHighClassBuildingA | 3301 | 2 | 3301 | 3303 | 2 | 2 | Construction64.gif | MapMKOHiResA64x32x0.gif | MapMKOHiResAEmpty64x32x0.gif |
| MarikoHighClassBuildingB | 3311 | 2 | 3311 | 3313 | 2 | 2 | Construction64.gif | MapMKOHiResB64x32x0.gif | MapMKOHiResBEmpty64x32x0.gif |
| MarikoHighClassBuildingC | 3321 | 2 | 3321 | 3323 | 1 | 1 | Construction32.gif | MapMKOHiResC64x32x0.gif | MapMKOHiResCEmpty64x32x0.gif |
| MarikoHighClassBuildingD | 3331 | 2 | 3331 | 3333 | 1 | 1 | Construction32.gif | MapMKOHiResD64x32x0.gif | MapMKOHiResDEmpty64x32x0.gif |

### Residential - Middle Class (VisualStages=2)
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture | Empty Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|---------------|
| MarikoMiddleClassBuildingA | 3351 | 2 | 3351 | 3353 | 3 | 3 | Construction128.gif | MapMKOMiResA64x32x0.gif | MapMKOMiResAEmpty64x32x0.gif |
| MarikoMiddleClassBuildingB | 3361 | 2 | 3361 | 3363 | 2 | 2 | Construction64.gif | MapMKOMiResB64x32x0.gif | MapMKOMiResBEmpty64x32x0.gif |
| MarikoMiddleClassBuildingC | 3371 | 2 | 3371 | 3373 | 2 | 2 | Construction64.gif | MapMKOMiResC64x32x0.gif | MapMKOMiResCEmpty64x32x0.gif |
| MarikoMiddleClassBuildingD | 3381 | 2 | 3381 | 3383 | 2 | 2 | Construction64.gif | MapMKOMiResD64x32x0.gif | MapMKOMiResDEmpty64x32x0.gif |
| MarikoMiddleClassBuildingE | 8501 | 2 | 8501 | 8503 | 2 | 2 | Construction64.gif | MapMKOMiResE64x32x0.gif | MapMKOMiResEEmpty64x32x0.gif |
| MarikoMiddleClassBuildingG | 8521 | 2 | 8521 | 8523 | 2 | 2 | Construction64.gif | MapMKOMiResG64x32x0.gif | MapMKOMiResGEmpty64x32x0.gif |

### Residential - Low Class (VisualStages=2)
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture | Empty Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|---------------|
| MarikoLowClassBuildingA | 3401 | 2 | 3401 | 3403 | 2 | 2 | Construction64.gif | MapMKOLoResA64x32x0.gif | MapMKOLoResAEmpty64x32x0.gif |
| MarikoLowClassBuildingB | 3411 | 2 | 3411 | 3413 | 2 | 2 | Construction64.gif | MapMKOLoResB64x32x0.gif | MapMKOLoResBEmpty64x32x0.gif |
| MarikoLowClassBuildingC | 3421 | 2 | 3421 | 3423 | 2 | 2 | Construction64.gif | MapMKOLoResC64x32x0.gif | MapMKOLoResCEmpty64x32x0.gif |
| MarikoLowClassBuildingD | 3431 | 2 | 3431 | 3433 | 2 | 2 | Construction64.gif | MapMKOLoResD64x32x0.gif | MapMKOLoResDEmpty64x32x0.gif |
| MarikoLowClassBuildingE | 8511 | 2 | 8511 | 8513 | 2 | 2 | Construction64.gif | MapMKOLoResE64x32x0.gif | MapMKOLoResEEmpty64x32x0.gif |

### Office Buildings (VisualStages=2)
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|
| MKOOfficeBuildingA | 3951 | 2 | 3951 | 3953 | 2 | 2 | Construction64.gif | MapMKOOfficeA64x32x0.gif |
| MKOOfficeBuildingB | 3961 | 2 | 3961 | 3963 | 2 | 2 | Construction64.gif | MapMKOOfficeB64x32x0.gif |
| MKOOfficeBuildingC | 3971 | 2 | 3971 | 3973 | 2 | 2 | Construction64.gif | MapMKOOfficeC64x32x0.gif |
| MKOOfficeBuildingD | 3981 | 2 | 3981 | 3983 | 2 | 2 | Construction64.gif | MapMKOOfficeD64x32x0.gif |
| MKOOfficeBuildingE | 3991 | 2 | 3991 | 3993 | 2 | 2 | Construction64.gif | MapMKOOfficeE64x32x0.gif |
| MKOOfficeBuildingF | 8531 | 2 | 8531 | 8533 | 2 | 2 | Construction64.gif | MapMKOOfficeF64x32x0.gif |

### Industries (VisualStages=1)
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|
| MarikoFarm | 3111 | 1 | 3111 | 3112 | 5 | 5 | Construction256.gif | MapMKOFarm64x32x0.gif |
| MarikoSmallFarm | 3115 | 1 | 3115 | 3116 | 3 | 3 | Construction128.gif | MapMKOSmallFarm64x32x0.gif |
| MarikoMine | 3121 | 1 | 3121 | 3122 | 5 | 5 | Construction256.gif | MapMKOMine64x32x0.gif |
| MarikoSmallMine | 3125 | 1 | 3125 | 3126 | 3 | 3 | Construction128.gif | MapMKOSmallMine64x32x0.gif |
| MarikoChemMine | 7211 | 1 | 7211 | 7212 | 5 | 5 | Construction256.gif | MapMKOChemMine64x32x0.gif |
| MarikoSmallChemMine | 7215 | 1 | 7215 | 7216 | 3 | 3 | Construction128.gif | MapMKOSmallChemMine64x32x0.gif |
| MarikoSiliconMine | 7221 | 1 | 7221 | 7222 | 5 | 5 | Construction256.gif | MapMKOSiliconMine64x32x0.gif |
| MarikoSmallSiliconMine | 7225 | 1 | 7225 | 7226 | 3 | 3 | Construction128.gif | MapMKOSmallSiliconMine64x32x0.gif |
| MarikoStoneMine | 7231 | 1 | 7231 | 7232 | 5 | 5 | Construction256.gif | MapMKOStoneMine64x32x0.gif |
| MarikoSmallStoneMine | 7235 | 1 | 7235 | 7236 | 3 | 3 | Construction128.gif | MapMKOSmallStoneMine64x32x0.gif |
| MarikoCoalMine | 7241 | 1 | 7241 | 7242 | 5 | 5 | Construction256.gif | MapMKOCoalMine64x32x0.gif |
| MarikoSmallCoalMine | 7245 | 1 | 7245 | 7246 | 3 | 3 | Construction128.gif | MapMKOSmallCoalMine64x32x0.gif |
| MarikoClothings | 3131 | 1 | 3131 | 3132 | 5 | 5 | Construction256.gif | MapMKOClothingIndustry64x32x0.gif |
| MarikoSmallClothings | 3135 | 1 | 3135 | 3136 | 3 | 3 | Construction128.gif | MapMKOSmallClothing64x32x0.gif |
| MarikoFoodProc | 3141 | 1 | 3141 | 3142 | 5 | 5 | Construction256.gif | MapMKOFoodProc64x32x0.gif |
| MarikoSmallFoodProc | 3145 | 1 | 3145 | 3146 | 3 | 3 | Construction128.gif | MapMKOSmallFoodProc64x32x0.gif |
| MarikoMetal | 3151 | 1 | 3151 | 3152 | 5 | 5 | Construction256.gif | MapMKOMetal64x32x0.gif |
| MarikoSmallMetal | 3155 | 1 | 3155 | 3156 | 3 | 3 | Construction128.gif | MapMKOSmallMetal64x32x0.gif |
| MarikoPlastic | 3261 | 1 | 3261 | 3262 | 5 | 5 | Construction256.gif | MapMKOPlastic64x32x0.gif |
| MarikoChemical | 3161 | 1 | 3161 | 3162 | 5 | 5 | Construction256.gif | MapMKOChemical64x32x0.gif |
| MarikoSmallChemical | 3165 | 1 | 3165 | 3166 | 3 | 3 | Construction128.gif | MapMKOSmallChemical64x32x0.gif |
| MarikoTextile | 3171 | 1 | 3171 | 3172 | 5 | 5 | Construction256.gif | MapMKOTextile64x32x0.gif |
| MarikoSmallTextile | 3175 | 1 | 3175 | 3176 | 3 | 3 | Construction128.gif | MapMKOSmallTextile64x32x0.gif |
| MarikoElectronic | 3181 | 1 | 3181 | 3182 | 5 | 5 | Construction256.gif | MapMKOElectronic64x32x0.gif |
| MarikoSmallElectronic | 3185 | 1 | 3185 | 3186 | 3 | 3 | Construction128.gif | MapMKOSmallElectronic64x32x0.gif |
| MarikoCarIndustry | 3191 | 1 | 3191 | 3192 | 5 | 5 | Construction256.gif | MapMKOCarIndustry64x32x0.gif |
| MarikoHeavy | 3201 | 1 | 3201 | 3202 | 5 | 5 | Construction256.gif | MapMKOHeavy64x32x0.gif |
| MarikoConstruction | 3211 | 1 | 3211 | 3212 | 5 | 5 | Construction256.gif | MapMKOConstruction64x32x0.gif |
| MarikoComputingIndustry | 3221 | 1 | 3221 | 3222 | 5 | 5 | Construction256.gif | MapMKOComputingIndustry64x32x0.gif |
| MarikoHHAIndustry | 3231 | 1 | 3231 | 3232 | 5 | 5 | Construction256.gif | MapMKOHHAIndustry64x32x0.gif |
| MarikoSmallHHAIndustry | 3235 | 1 | 3235 | 3236 | 3 | 3 | Construction128.gif | MapMKOSmallHHAIndustry64x32x0.gif |
| MarikoLegalServices | 3241 | 1 | 3241 | 3242 | 5 | 5 | Construction256.gif | MapMKOLegalServices64x32x0.gif |
| MarikoBusinessMachine | 3251 | 1 | 3251 | 3252 | 5 | 5 | Construction256.gif | MapMKOBM64x32x0.gif |
| MarikoCDPlant | 8541 | 1 | 8541 | 8542 | 5 | 5 | Construction256.gif | MapMKOCDPlant64x32x0.gif |

### Commerce (VisualStages=1)
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|
| MarikoFoodStore | 3601 | 1 | 3601 | 3602 | 2 | 2 | Construction64.gif | MapMKOFoodStore64x32x0.gif |
| MarikoClothesStore | 3631 | 1 | 3631 | 3632 | 2 | 2 | Construction64.gif | MapMKOClothesStore64x32x0.gif |
| MarikoHHAsStore | 3661 | 1 | 3661 | 3662 | 2 | 2 | Construction64.gif | MapMKOHHAStore64x32x0.gif |
| MarikoComputersStore | 7281 | 1 | 7281 | 7282 | 2 | 2 | Construction64.gif | MapMKOComputersStore64x32x0.gif |
| MarikoCarStore | 3691 | 1 | 3691 | 3692 | 2 | 2 | Construction64.gif | MapMKOCarStore64x32x0.gif |
| MarikoCDStore | 7296 | 1 | 7296 | 7297 | 2 | 2 | Construction64.gif | MapMKOCDStore64x32x0.gif |
| MarikoSupermarketA | 3721 | 1 | 3721 | 3722 | 3 | 3 | Construction128.gif | MapMKOSupermarketA64x32x0.gif |
| MarikoSupermarketB | 3731 | 1 | 3731 | 3732 | 3 | 3 | Construction128.gif | MapMKOSupermarketB64x32x0.gif |
| MarikoSupermarketC | 3741 | 1 | 3741 | 3742 | 3 | 3 | Construction128.gif | MapMKOSupermarketC64x32x0.gif |
| MarikoBar | 3751 | 1 | 3751 | 3752 | 2 | 2 | Construction64.gif | MapMKOBar64x32x0.gif |
| MarikoRestaurant | 3771 | 1 | 3771 | 3772 | 2 | 2 | Construction64.gif | MapMKORestaurant64x32x0.gif |

### Public Services (VisualStages=1)
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|
| MarikoHospital | 3801 | 1 | 3801 | 3802 | 2 | 2 | Construction64.gif | MapMKOHospital64x32x0.gif |
| MarikoSchool | 3811 | 1 | 3811 | 3812 | 2 | 2 | Construction64.gif | MapMKOSchool64x32x0.gif |
| MarikoPolice | 3821 | 1 | 3821 | 3822 | 2 | 2 | Construction64.gif | MapMKOPolice64x32x0.gif |
| MarikoFire | 3831 | 1 | 3831 | 3832 | 2 | 2 | Construction64.gif | MapMKOFire64x32x0.gif |

### Parks (VisualStages=1)
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|
| MKOSmallPark | 2831 | 1 | 2831 | 2832 | 5 | 5 | Construction256.gif | MapSmallPark64x32x0.gif |
| MKOMediumPark | 2841 | 1 | 2841 | 2842 | 7 | 7 | Construction320.gif | MapMediumPark64x32x0.gif |
| MKOCentralPark | 2851 | 1 | 2851 | 2852 | 9 | 9 | Construction320.gif | MapCentralPark64x32x0.gif |

### TV & Landmarks
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|
| MarikoTVStation | 3881 | 1 | 3881 | 3882 | 2 | 2 | Construction64.gif | MapMKOTVStation64x32x0.gif |
| MarikoTVAntenna | 3891 | 1 | 3891 | 3892 | 2 | 2 | Construction64.gif | MapMKOTVAntenna64x32x0.gif |
| MarikoLiberty | 6011 | 5 | 6011 | 6016 | 4 | 4 | Construction192.gif | MapLiberty64x32x0.gif |
| MarikoTower | 6021 | 5 | 6021 | 6026 | 4 | 4 | Construction192.gif | MapTower64x32x0.gif |

---

## MOAB CLUSTER

### Headquarters
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|
| MoabTownHall | 1500 | 1 | 1500 | 1501 | 2 | 2 | Construction64.gif | MapMoabTownHall64x32x0.gif |
| MoabTradeCenter | 1510 | 1 | 1510 | 1511 | 2 | 2 | Construction64.gif | MapMoabTradeCenter64x32x0.gif |
| MoabGeneralHeadquarter | 1901 | 1 | 1901 | 1902 | 2 | 2 | Construction64.gif | MapMoabGenHQ64x32x0.gif |
| MoabIndHeadquarter | 1911 | 1 | 1911 | 1912 | 2 | 2 | Construction64.gif | MapMoabIndHQ64x32x0.gif |
| MoabIllusionHeadquarter | 1921 | 1 | 1921 | 1922 | 2 | 2 | Construction64.gif | MapMoabIllusionHQ64x32x0.gif |
| MoabResHeadquarter | 1931 | 1 | 1931 | 1932 | 2 | 2 | Construction64.gif | MapMoabResHQ64x32x0.gif |
| MoabCorrectionHeadquarter | 1941 | 1 | 1941 | 1942 | 2 | 2 | Construction64.gif | MapMoabCorrectionHQ64x32x0.gif |

### Residential - Low Cost (VisualStages=1)
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture | Empty Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|---------------|
| KnightsLoCost | 1461 | 1 | 1461 | 1462 | 2 | 2 | Construction64.gif | MapMoabLoCostHiRes64x32x0.gif | MapMoabLoCostHiResEmpty64x32x0.gif |
| NursesLoCost | 1471 | 1 | 1471 | 1472 | 2 | 2 | Construction64.gif | MapMoabLoCostMidRes64x32x0.gif | MapMoabLoCostMidResEmpty64x32x0.gif |
| BeingsLoCost | 1481 | 1 | 1481 | 1482 | 2 | 2 | Construction64.gif | MapMoabLoCostLoRes64x32x0.gif | MapMoabLoCostLoResEmpty64x32x0.gif |

### Residential - Knights (VisualStages=2)
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture | Empty Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|---------------|
| KnightsBuildingA | 1361 | 2 | 1361 | 1363 | 3 | 3 | Construction128.gif | MapMoabHiResA64x32x0.gif | MapMoabHiResAEmpty64x32x0.gif |
| KnightsBuildingB | 1371 | 2 | 1371 | 1373 | 3 | 3 | Construction128.gif | MapMoabHiResB64x32x0.gif | MapMoabHiResBEmpty64x32x0.gif |
| KnightsBuildingC | 1381 | 2 | 1381 | 1383 | 2 | 2 | Construction64.gif | MapMoabHiResC64x32x0.gif | MapMoabHiResCEmpty64x32x0.gif |
| KnightsBuildingD | 1451 | 2 | 1451 | 1453 | 3 | 3 | Construction128.gif | MapMoabHiResD64x32x0.gif | MapMoabHiResDEmpty64x32x0.gif |
| KnightsBuildingE | 1451 | 2 | 1451 | 1453 | 2 | 2 | Construction64.gif | MapMoabHiResE64x32x0.gif | MapMoabHiResEEmpty64x32x0.gif |

### Residential - Nurses (VisualStages=2)
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture | Empty Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|---------------|
| NurseDomeA | 1341 | 2 | 1341 | 1343 | 5 | 5 | Construction256.gif | MapMoabMidResA64x32x0.gif | MapMoabMidResAEmpty64x32x0.gif |
| NurseDomeB | 1351 | 2 | 1351 | 1353 | 2 | 2 | Construction64.gif | MapMoabMidResB64x32x0.gif | MapMoabMidResBEmpty64x32x0.gif |
| NurseDomeC | 1431 | 2 | 1431 | 1433 | 3 | 3 | Construction128.gif | MapMoabMidResC64x32x0.gif | MapMoabMidResCEmpty64x32x0.gif |
| NurseDomeD | 1441 | 2 | 1441 | 1443 | 3 | 3 | Construction128.gif | MapMoabMidResD64x32x0.gif | MapMoabMidResDEmpty64x32x0.gif |

### Residential - Beings (VisualStages=2)
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture | Empty Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|---------------|
| BeingsDomeA | 1301 | 2 | 1301 | 1303 | 2 | 2 | Construction64.gif | MapMoabLoResA64x32x0.gif | MapMoabLoResAEmpty64x32x0.gif |
| BeingsDomeB | 1311 | 2 | 1311 | 1313 | 4 | 4 | Construction192.gif | MapMoabLoResB64x32x0.gif | MapMoabLoResBEmpty64x32x0.gif |
| BeingsDomeC | 1321 | 2 | 1321 | 1323 | 2 | 2 | Construction64.gif | MapMoabLoResC64x32x0.gif | MapMoabLoResCEmpty64x32x0.gif |
| BeingsDomeD | 1331 | 2 | 1331 | 1333 | 3 | 3 | Construction128.gif | MapMoabLoResD64x32x0.gif | MapMoabLoResDEmpty64x32x0.gif |

### Office Buildings (VisualStages=2)
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|
| MoabOfficeBuildingA | 1951 | 2 | 1951 | 1953 | 2 | 2 | Construction64.gif | MapMoabOfficeA64x32x0.gif |
| MoabOfficeBuildingB | 1961 | 2 | 1961 | 1963 | 2 | 2 | Construction64.gif | MapMoabOfficeB64x32x0.gif |

### Industries (VisualStages=1)
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|
| MoabFarm | 1111 | 1 | 1111 | 1112 | 5 | 5 | Construction256.gif | MapMoabFarm64x32x0.gif |
| MoabMine | 1121 | 1 | 1121 | 1122 | 5 | 5 | Construction256.gif | MapMoabMine64x32x0.gif |
| MoabChemMine | 7011 | 1 | 7011 | 7012 | 5 | 5 | Construction256.gif | MapMoabChemMine64x32x0.gif |
| MoabSiliconMine | 7021 | 1 | 7021 | 7022 | 5 | 5 | Construction256.gif | MapMoabSiliconMine64x32x0.gif |
| MoabStoneMine | 7031 | 1 | 7031 | 7032 | 5 | 5 | Construction256.gif | MapMoabStoneMine64x32x0.gif |
| MoabCoalMine | 7041 | 1 | 7041 | 7042 | 5 | 5 | Construction256.gif | MapMoabCoalMine64x32x0.gif |
| MoabElectronic | 1131 | 1 | 1131 | 1132 | 5 | 5 | Construction256.gif | MapMoabElectronic64x32x0.gif |
| MoabFoodDome | 1141 | 1 | 1141 | 1142 | 5 | 5 | Construction256.gif | MapMoabFoodDome64x32x0.gif |
| MoabMetal | 1151 | 1 | 1151 | 1152 | 5 | 5 | Construction256.gif | MapMoabMetal64x32x0.gif |
| MoabChemical | 1161 | 1 | 1161 | 1162 | 5 | 5 | Construction256.gif | MapMoabChemical64x32x0.gif |
| MoabTextile | 1171 | 1 | 1171 | 1172 | 5 | 5 | Construction256.gif | MapMoabTextile64x32x0.gif |
| MoabClothings | 1181 | 1 | 1181 | 1182 | 5 | 5 | Construction256.gif | MapMoabClothing64x32x0.gif |
| MoabCarIndustry | 1191 | 1 | 1191 | 1192 | 5 | 5 | Construction256.gif | MapMoabCarIndustry64x32x0.gif |
| MoabHHAIndustry | 1201 | 1 | 1201 | 1202 | 5 | 5 | Construction256.gif | MapMoabHHAIndustry64x32x0.gif |
| MoabBusinessMachine | 1211 | 1 | 1211 | 1212 | 5 | 5 | Construction256.gif | MapMoabBM64x32x0.gif |
| MoabConstruction | 1221 | 1 | 1221 | 1222 | 5 | 5 | Construction256.gif | MapMoabConstruction64x32x0.gif |
| MoabHeavy | 1231 | 1 | 1231 | 1232 | 5 | 5 | Construction256.gif | MapMoabHeavy64x32x0.gif |
| MoabOilRig | 1241 | 1 | 1241 | 1242 | 5 | 5 | Construction256.gif | MapMoabOilRig64x32x0.gif |
| MoabRefinery | 1251 | 1 | 1251 | 1252 | 5 | 5 | Construction256.gif | MapMoabRefinery64x32x0.gif |
| MoabComputingIndustry | 1031 | 1 | 1031 | 1032 | 5 | 5 | Construction256.gif | MapMoabComputingIndustry64x32x0.gif |
| MoabLegalServices | 1041 | 1 | 1041 | 1042 | 5 | 5 | Construction256.gif | MapMoabLegalServices64x32x0.gif |

### Commerce (VisualStages=1)
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|
| MoabFoodStore | 1711 | 1 | 1711 | 1712 | 2 | 2 | Construction64.gif | MapMoabFoodStore64x32x0.gif |
| MoabCarStore | 1721 | 1 | 1721 | 1722 | 2 | 2 | Construction64.gif | MapMoabCarStore64x32x0.gif |
| MoabClothesStore | 1731 | 1 | 1731 | 1732 | 2 | 2 | Construction64.gif | MapMoabClothesStore64x32x0.gif |
| MoabSupermarket | 1741 | 1 | 1741 | 1742 | 3 | 3 | Construction128.gif | MapMoabSupermarket64x32x0.gif |
| MoabBar | 1751 | 1 | 1751 | 1752 | 2 | 2 | Construction64.gif | MapMoabBar64x32x0.gif |
| MoabHHAsStore | 1761 | 1 | 1761 | 1762 | 2 | 2 | Construction64.gif | MapMoabHHAStore64x32x0.gif |
| MoabMovie | 1771 | 1 | 1771 | 1772 | 3 | 3 | Construction128.gif | MapMoabMovie64x32x0.gif |
| MoabGasStation | 1781 | 1 | 1781 | 1782 | 2 | 2 | Construction64.gif | MapMoabGasStation64x32x0.gif |
| MoabRestaurant | 1751 | 1 | 1751 | 1752 | 2 | 2 | Construction64.gif | MapMoabRestaurant64x32x0.gif |
| MoabFuneral | 7301 | 1 | 7301 | 7302 | 2 | 2 | Construction64.gif | MapMoabFuneral64x32x0.gif |

### Public Services
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|
| MoabBigCorrectional | 1021 | 1 | 1021 | 1022 | 3 | 3 | Construction128.gif | MapMoabBigCorrectional64x32x0.gif |

### Parks & Landmarks
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|
| MoabSmallPark | 2831 | 1 | 2831 | 2832 | 5 | 5 | Construction256.gif | MapSmallPark64x32x0.gif |
| MoabMediumPark | 2841 | 1 | 2841 | 2842 | 7 | 7 | Construction320.gif | MapMediumPark64x32x0.gif |
| MoabCentralPark | 2851 | 1 | 2851 | 2852 | 9 | 9 | Construction320.gif | MapCentralPark64x32x0.gif |
| MoabTVStation | 1981 | 1 | 1981 | 1982 | 2 | 2 | Construction64.gif | MapMoabTVStation64x32x0.gif |
| MoabTVAntenna | 1991 | 1 | 1991 | 1992 | 2 | 2 | Construction64.gif | MapMoabTVAntenna64x32x0.gif |
| MoabLiberty | 6011 | 5 | 6011 | 6016 | 4 | 4 | Construction192.gif | MapLiberty64x32x0.gif |
| MoabTower | 6021 | 5 | 6021 | 6026 | 4 | 4 | Construction192.gif | MapTower64x32x0.gif |

---

## DISSIDENTS CLUSTER

### Headquarters
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|
| DissTownHall | 2500 | 1 | 2500 | 2501 | 2 | 2 | Construction64.gif | MapDisTownHall64x32x0.gif |
| DissTradeCenter | 2510 | 1 | 2510 | 2511 | 2 | 2 | Construction64.gif | MapDisTradeCenter64x32x0.gif |
| DissGeneralHeadquarter | 2901 | 1 | 2901 | 2902 | 2 | 2 | Construction64.gif | MapDisGenHQ64x32x0.gif |
| DissIndHeadquarter | 2911 | 1 | 2911 | 2912 | 2 | 2 | Construction64.gif | MapDisIndHQ64x32x0.gif |
| DissServiceHeadquarter | 2921 | 1 | 2921 | 2922 | 2 | 2 | Construction64.gif | MapDisServHQ64x32x0.gif |
| DissResHeadquarter | 2931 | 1 | 2931 | 2932 | 2 | 2 | Construction64.gif | MapDisResHQ64x32x0.gif |
| DissPubHeadquarter | 2941 | 1 | 2941 | 2942 | 2 | 2 | Construction64.gif | MapDisPubHQ64x32x0.gif |

### Residential - Low Cost (VisualStages=1)
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture | Empty Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|---------------|
| DissHighClassLoCost | 2481 | 1 | 2481 | 2482 | 2 | 2 | Construction64.gif | MapDisLoCostHiRes64x32x0.gif | MapDisLoCostHiResEmpty64x32x0.gif |
| DissMiddleClassLoCost | 2471 | 1 | 2471 | 2472 | 2 | 2 | Construction64.gif | MapDisLoCostMiRes64x32x0.gif | MapDisLoCostMiResEmpty64x32x0.gif |
| DissLowClassLoCost | 2461 | 1 | 2461 | 2462 | 2 | 2 | Construction64.gif | MapDisLoCostLoRes64x32x0.gif | MapDisLoCostLoResEmpty64x32x0.gif |

### Residential - High Class (VisualStages=2)
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture | Empty Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|---------------|
| DissHighClassBuildingA | 2441 | 2 | 2441 | 2443 | 2 | 2 | Construction64.gif | MapDisHiResA64x32x0.gif | MapDisHiResAEmpty64x32x0.gif |
| DissHighClassBuildingB | 2451 | 2 | 2451 | 2453 | 2 | 2 | Construction64.gif | MapDisHiResB64x32x0.gif | MapDisHiResBEmpty64x32x0.gif |
| DissHighClassBuildingC | 2541 | 2 | 2541 | 2543 | 2 | 2 | Construction64.gif | MapDisHiResC64x32x0.gif | MapDisHiResCEmpty64x32x0.gif |
| DissHighClassBuildingD | 2551 | 2 | 2551 | 2553 | 2 | 2 | Construction64.gif | MapDisHiResD64x32x0.gif | MapDisHiResDEmpty64x32x0.gif |

### Residential - Middle Class (VisualStages=2)
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture | Empty Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|---------------|
| DissMiddleClassBuildingA | 2421 | 2 | 2421 | 2423 | 2 | 2 | Construction64.gif | MapDisMiResA64x32x0.gif | MapDisMiResAEmpty64x32x0.gif |
| DissMiddleClassBuildingB | 2431 | 2 | 2431 | 2433 | 2 | 2 | Construction64.gif | MapDisMiResB64x32x0.gif | MapDisMiResBEmpty64x32x0.gif |
| DissMiddleClassBuildingC | 2561 | 2 | 2561 | 2563 | 2 | 2 | Construction64.gif | MapDisMiResC64x32x0.gif | MapDisMiResCEmpty64x32x0.gif |
| DissMiddleClassBuildingD | 2341 | 2 | 2341 | 2343 | 2 | 2 | Construction64.gif | MapDisMiResD64x32x0.gif | MapDisMiResDEmpty64x32x0.gif |
| DissMiddleClassBuildingE | 2351 | 2 | 2351 | 2353 | 2 | 2 | Construction64.gif | MapDisMiResE64x32x0.gif | MapDisMiResEEmpty64x32x0.gif |
| DissMiddleClassBuildingF | 6501 | 2 | 6501 | 6503 | 2 | 2 | Construction64.gif | MapDisMiResF64x32x0.gif | MapDisMiResFEmpty64x32x0.gif |

### Residential - Low Class (VisualStages=2)
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture | Empty Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|---------------|
| DissLowClassDomeA | 2401 | 2 | 2401 | 2403 | 2 | 2 | Construction64.gif | MapDisLoResA64x32x0.gif | MapDisLoResAEmpty64x32x0.gif |
| DissLowClassDomeB | 2411 | 2 | 2411 | 2413 | 2 | 2 | Construction64.gif | MapDisLoResB64x32x0.gif | MapDisLoResBEmpty64x32x0.gif |
| DissLowClassDomeC | 2311 | 2 | 2311 | 2313 | 2 | 2 | Construction64.gif | MapDisLoResC64x32x0.gif | MapDisLoResCEmpty64x32x0.gif |
| DissLowClassDomeD | 6511 | 7 | 6511 | 6518 | 2 | 2 | Construction64.gif | MapDisLoResD64x32x0.gif | MapDisLoResDEmpty64x32x0.gif |

### Office Buildings (VisualStages=2)
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|
| DissOfficeBuildingA | 2951 | 2 | 2951 | 2953 | 2 | 2 | Construction64.gif | MapDisOfficeA64x32x0.gif |
| DissOfficeBuildingB | 2961 | 2 | 2961 | 2963 | 2 | 2 | Construction64.gif | MapDisOfficeB64x32x0.gif |
| DissOfficeBuildingC | 2971 | 2 | 2971 | 2973 | 2 | 2 | Construction64.gif | MapDisOfficeC64x32x0.gif |

### Industries (VisualStages=1)
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|
| DissFarm | 2111 | 1 | 2111 | 2112 | 5 | 5 | Construction256.gif | MapDisFarm64x32x0.gif |
| DissSmallFarm | 2115 | 1 | 2115 | 2116 | 3 | 3 | Construction128.gif | MapDisSmallFarm64x32x0.gif |
| DissMine | 2121 | 1 | 2121 | 2122 | 5 | 5 | Construction256.gif | MapDisMine64x32x0.gif |
| DissMineSmall | 2125 | 1 | 2125 | 2126 | 3 | 3 | Construction128.gif | MapDisSmallMine64x32x0.gif |
| DissChemMine | 7111 | 1 | 7111 | 7112 | 5 | 5 | Construction256.gif | MapDisChemMine64x32x0.gif |
| DissChemMineSmall | 7115 | 1 | 7115 | 7116 | 3 | 3 | Construction128.gif | MapDisSmallChemMine64x32x0.gif |
| DissSiliconMine | 7121 | 1 | 7121 | 7122 | 5 | 5 | Construction256.gif | MapDisSiliconMine64x32x0.gif |
| DissSiliconMineSmall | 7125 | 1 | 7125 | 7126 | 3 | 3 | Construction128.gif | MapDisSmallSiliconMine64x32x0.gif |
| DissStoneMine | 7131 | 1 | 7131 | 7132 | 5 | 5 | Construction256.gif | MapDisStoneMine64x32x0.gif |
| DissStoneMineSmall | 7135 | 1 | 7135 | 7136 | 3 | 3 | Construction128.gif | MapDisSmallStoneMine64x32x0.gif |
| DissCoalMine | 7141 | 1 | 7141 | 7142 | 5 | 5 | Construction256.gif | MapDisCoalMine64x32x0.gif |
| DissCoalMineSmall | 7145 | 1 | 7145 | 7146 | 3 | 3 | Construction128.gif | MapDisSmallCoalMine64x32x0.gif |
| DissClothings | 2131 | 1 | 2131 | 2132 | 5 | 5 | Construction256.gif | MapDisClothingIndustry64x32x0.gif |
| DissClothingsSmall | 2135 | 1 | 2135 | 2136 | 3 | 3 | Construction128.gif | MapDisSmallClothing64x32x0.gif |
| DissFoodProc | 2141 | 1 | 2141 | 2142 | 5 | 5 | Construction256.gif | MapDisFoodProc64x32x0.gif |
| DissFoodProcSmall | 2145 | 1 | 2145 | 2146 | 3 | 3 | Construction128.gif | MapDisSmallFoodProc64x32x0.gif |
| DissLiquorFact | 2195 | 1 | 2195 | 2196 | 5 | 5 | Construction256.gif | MapDisLiquorFact64x32x0.gif |
| DissMetal | 2151 | 1 | 2151 | 2152 | 5 | 5 | Construction256.gif | MapDisMetal64x32x0.gif |
| DissMetalSmall | 2155 | 1 | 2155 | 2156 | 3 | 3 | Construction128.gif | MapDisSmallMetal64x32x0.gif |
| DissChemical | 2161 | 1 | 2161 | 2162 | 5 | 5 | Construction256.gif | MapDisChemical64x32x0.gif |
| DissChemicalSmall | 2165 | 1 | 2165 | 2166 | 3 | 3 | Construction128.gif | MapDisSmallChemical64x32x0.gif |
| DissTextile | 2171 | 1 | 2171 | 2172 | 5 | 5 | Construction256.gif | MapDisTextile64x32x0.gif |
| DissTextileSmall | 2175 | 1 | 2175 | 2176 | 3 | 3 | Construction128.gif | MapDisSmallTextile64x32x0.gif |
| DissElectronic | 2181 | 1 | 2181 | 2182 | 5 | 5 | Construction256.gif | MapDisElectronic64x32x0.gif |
| DissElectronicSmall | 2185 | 1 | 2185 | 2186 | 3 | 3 | Construction128.gif | MapDisSmallElectronic64x32x0.gif |
| DissCarIndustry | 2191 | 1 | 2191 | 2192 | 5 | 5 | Construction256.gif | MapDisCarIndustry64x32x0.gif |
| DissHeavy | 2201 | 1 | 2201 | 2202 | 5 | 5 | Construction256.gif | MapDisHeavy64x32x0.gif |
| DissConstruction | 2211 | 1 | 2211 | 2212 | 5 | 5 | Construction256.gif | MapDisConstIndustry64x32x0.gif |
| DissComputingIndustry | 2221 | 1 | 2221 | 2222 | 5 | 5 | Construction256.gif | MapDisComputingIndustry64x32x0.gif |
| DissHHAIndustry | 2231 | 1 | 2231 | 2232 | 5 | 5 | Construction256.gif | MapDisHHAIndustry64x32x0.gif |
| DissHHAIndustrySmall | 2231 | 1 | 2231 | 2232 | 3 | 3 | Construction128.gif | MapDisSmallHHAIndustry64x32x0.gif |
| DissToyIndustry | 2791 | 1 | 2791 | 2792 | 5 | 5 | Construction256.gif | MapDisToyIndustry64x32x0.gif |
| DissLegalServices | 2241 | 1 | 2241 | 2242 | 5 | 5 | Construction256.gif | MapDisLegalServ64x32x0.gif |
| DissBusinessMachine | 2251 | 1 | 2251 | 2252 | 5 | 5 | Construction256.gif | MapDisBM64x32x0.gif |
| DissLumberMill | 7201 | 1 | 7201 | 7202 | 5 | 5 | Construction256.gif | MapDisLumberMill64x32x0.gif |
| DissFurnitureInd | 7251 | 1 | 7251 | 7252 | 5 | 5 | Construction256.gif | MapDisFurnitureInd64x32x0.gif |

### Commerce (VisualStages=1)
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|
| DissBank | 2261 | 1 | 2261 | 2262 | 2 | 2 | Construction64.gif | MapDisBank64x32x0.gif |
| DissFoodStore | 2711 | 1 | 2711 | 2712 | 2 | 2 | Construction64.gif | MapDisFoodStore64x32x0.gif |
| DissCarStore | 2721 | 1 | 2721 | 2722 | 2 | 2 | Construction64.gif | MapDisCarStore64x32x0.gif |
| DissClothesStore | 2731 | 1 | 2731 | 2732 | 2 | 2 | Construction64.gif | MapDisClothesStore64x32x0.gif |
| DissHHAsStore | 2661 | 1 | 2661 | 2662 | 2 | 2 | Construction64.gif | MapDisHHAStore64x32x0.gif |
| DissToysStore | 2891 | 1 | 2891 | 2892 | 2 | 2 | Construction64.gif | MapDisToysStore64x32x0.gif |
| DissFurnituresStore | 7261 | 1 | 7261 | 7262 | 2 | 2 | Construction64.gif | MapDisFurnituresStore64x32x0.gif |
| DissBooksStore | 7271 | 1 | 7271 | 7272 | 2 | 2 | Construction64.gif | MapDisBooksStore64x32x0.gif |
| DissSupermarketA | 2741 | 1 | 2741 | 2742 | 3 | 3 | Construction128.gif | MapDisSupermarketA64x32x0.gif |
| DissSupermarketB | 2761 | 1 | 2761 | 2762 | 3 | 3 | Construction128.gif | MapDisSupermarketB64x32x0.gif |
| DissBar | 2751 | 1 | 2751 | 2752 | 2 | 2 | Construction64.gif | MapDisBar64x32x0.gif |
| DissFuneral | 7291 | 1 | 7291 | 7292 | 2 | 2 | Construction64.gif | MapDisFuneral64x32x0.gif |
| DissRestaurant | 2771 | 1 | 2771 | 2772 | 2 | 2 | Construction64.gif | MapDisRestaurant64x32x0.gif |
| DissMovie | 2781 | 1 | 2781 | 2782 | 3 | 3 | Construction128.gif | MapDisMovie64x32x0.gif |

### Public Services (VisualStages=1)
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|
| DissHospital | 2801 | 1 | 2801 | 2802 | 3 | 3 | Construction128.gif | MapDisHospital64x32x0.gif |
| DissSchool | 2811 | 1 | 2811 | 2812 | 3 | 3 | Construction128.gif | MapDisSchool64x32x0.gif |
| DissPolice | 2821 | 1 | 2821 | 2822 | 1 | 1 | Construction32.gif | MapDisPolice64x32x0.gif |

### Parks & Landmarks
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|
| DissSmallPark | 2831 | 1 | 2831 | 2832 | 5 | 5 | Construction256.gif | MapSmallPark64x32x0.gif |
| DissMediumPark | 2841 | 1 | 2841 | 2842 | 7 | 7 | Construction320.gif | MapMediumPark64x32x0.gif |
| DissCentralPark | 2851 | 1 | 2851 | 2852 | 9 | 9 | Construction320.gif | MapCentralPark64x32x0.gif |
| DissTVStation | 2981 | 1 | 2981 | 2982 | 2 | 2 | Construction64.gif | MapDisTVStation64x32x0.gif |
| DissTVAntenna | 2991 | 1 | 2991 | 2992 | 2 | 2 | Construction64.gif | MapDisTVAntenna64x32x0.gif |
| DissLiberty | 6011 | 5 | 6011 | 6016 | 4 | 4 | Construction192.gif | MapLiberty64x32x0.gif |
| DissTower | 6021 | 5 | 6021 | 6026 | 4 | 4 | Construction192.gif | MapTower64x32x0.gif |

---

## MAGNA CLUSTER

### All Facilities (VisualStages=2)
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|
| MagnaMainHQ | 5001 | 2 | 5001 | 5003 | 3 | 3 | Construction128.gif | MapMagnaMainHQ64x32x0.gif |
| MagnaWhirlpool | 5101 | 2 | 5101 | 5103 | 3 | 3 | Construction128.gif | MapMagnaWhirlpool64x32x0.gif |
| MagnaSolarium | 5111 | 2 | 5111 | 5113 | 3 | 3 | Construction128.gif | MapMagnaSolarium64x32x0.gif |
| MagnaTulip | 5181 | 2 | 5181 | 5183 | 3 | 3 | Construction128.gif | MapMagnaTulip64x32x0.gif |
| MagnaIvoryTower | 5121 | 2 | 5121 | 5123 | 3 | 3 | Construction128.gif | MapMagnaIvoryTower64x32x0.gif |
| MagnaMayFlower | 5131 | 2 | 5131 | 5133 | 3 | 3 | Construction128.gif | MapMagnaMayFlower64x32x0.gif |
| MagnaCloudCity | 5141 | 2 | 5141 | 5143 | 3 | 3 | Construction128.gif | MapMagnaCloudCity64x32x0.gif |
| MagnaSkyDome | 5191 | 2 | 5191 | 5193 | 3 | 3 | Construction128.gif | MapMagnaSkyDome64x32x0.gif |
| MagnaHeaven | 5151 | 2 | 5151 | 5153 | 3 | 3 | Construction128.gif | MapMagnaHeaven64x32x0.gif |
| MagnaHive | 5161 | 2 | 5161 | 5163 | 3 | 3 | Construction128.gif | MapMagnaHive64x32x0.gif |
| MagnaOctopus | 5171 | 2 | 5171 | 5173 | 3 | 3 | Construction128.gif | MapMagnaOctopus64x32x0.gif |
| MagnaTheSpring | 5201 | 2 | 5201 | 5203 | 3 | 3 | Construction128.gif | MapMagnaTheSpring64x32x0.gif |
| MagnaSupermarketA | 5211 | 2 | 5211 | 5213 | 2 | 2 | Construction64.gif | MapMagnaSupermarketA64x32x0.gif |
| MagnaSupermarketB | 5221 | 2 | 5221 | 5223 | 2 | 2 | Construction64.gif | MapMagnaSupermarketB64x32x0.gif |
| MagnaResearchCenter | 5231 | 2 | 5231 | 5233 | 2 | 2 | Construction64.gif | MapMagnaResearchCenter64x32x0.gif |
| MagnaMovieStudio | 5241 | 2 | 5241 | 5243 | 8 | 8 | Construction320.gif | MapMagnaMovieStudio64x32x0.gif |

### Parks & Landmarks
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|
| MagnaSmallPark | 2831 | 1 | 2831 | 2832 | 5 | 5 | Construction256.gif | MapSmallPark64x32x0.gif |
| MagnaMediumPark | 2841 | 1 | 2841 | 2842 | 7 | 7 | Construction320.gif | MapMediumPark64x32x0.gif |
| MagnaCentralPark | 2851 | 1 | 2851 | 2852 | 9 | 9 | Construction320.gif | MapCentralPark64x32x0.gif |
| MagnaLiberty | 6011 | 5 | 6011 | 6016 | 4 | 4 | Construction192.gif | MapLiberty64x32x0.gif |
| MagnaTower | 6021 | 5 | 6021 | 6026 | 4 | 4 | Construction192.gif | MapTower64x32x0.gif |

---

## UW CLUSTER (Warehouses)

### All Warehouses (VisualStages=3)
| NewFacility Name | Base VisualClass | Stage0 VS | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture |
|------------------|------------------|-----------|--------------|----------|-------|-------|---------------------|------------------|
| UWColdStorage | 301 | 3 | 301 | 304 | 5 | 5 | Construction256.gif | MapUWColdStorage64x32x0.gif |
| UWChemicalStorage | 311 | 3 | 311 | 314 | 5 | 5 | Construction256.gif | MapUWChemicalStorage64x32x0.gif |
| UWGeneralStorage | 321 | 3 | 321 | 324 | 6 | 6 | Construction256.gif | MapUWGeneralStorage64x32x0.gif |
| UWSuperColdStorage | 331 | 3 | 331 | 334 | 5 | 5 | Construction256.gif | MapUWSuperColdStorage64x32x0.gif |
| UWOreStorage | 351 | 3 | 351 | 354 | 5 | 5 | Construction256.gif | MapUWOreStorage64x32x0.gif |
| UWFabricsStorage | 431 | 3 | 431 | 434 | 5 | 5 | Construction256.gif | MapUWFabricsStorage64x32x0.gif |
| UWMegaStorage | 531 | 3 | 531 | 534 | 4 | 4 | Construction192.gif | MapUWMegaStorage64x32x0.gif |
| UWMegaStorageExp | 541 | 3 | 541 | 544 | 4 | 4 | Construction192.gif | MapUWMegaStorageExp64x32x0.gif |

---

## SHARED PARKS (vidFacility shared across clusters)

| VisualClass | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture | Used By |
|-------------|--------------|----------|-------|-------|---------------------|------------------|---------|
| 2831 | 2831 | 2832 | 5 | 5 | Construction256.gif | MapSmallPark64x32x0.gif | All SmallParks |
| 2841 | 2841 | 2842 | 7 | 7 | Construction320.gif | MapMediumPark64x32x0.gif | All MediumParks |
| 2851 | 2851 | 2852 | 9 | 9 | Construction320.gif | MapCentralPark64x32x0.gif | All CentralParks |

---

## SHARED LANDMARKS (vidFacility shared across clusters)

| VisualClass | Construction | Complete | XSize | YSize | Construction Texture | Complete Texture | Note |
|-------------|--------------|----------|-------|-------|---------------------|------------------|------|
| 6011 | 6011 | 6016 | 4 | 4 | Construction192.gif | MapLiberty64x32x0.gif | Liberty (VisualStages=5) |
| 6021 | 6021 | 6026 | 4 | 4 | Construction192.gif | MapTower64x32x0.gif | Tower (VisualStages=5) |

---

## YOUR ISSUE EXPLAINED

**PGIDrugStore:**
- Base VisualClass: **4701**
- Stage 0 (Construction) VisualStages: **1** (default)
- Construction VisualClass: **4701**
- Complete VisualClass: **4701 + 1 = 4702**
- XSize: **2**, YSize: **2**
- Construction Texture: **Construction64.gif**
- Complete Texture: **MapPGIDrugStore64x32x0.gif**

When ObjectsInArea returns **4702**, it means the DrugStore is **COMPLETED** (Stage 1).
CLASSES.BIN should contain entries for **both** 4701 (construction) AND 4702 (complete).

---

## Construction Texture Size Mapping

| Building Size | Construction Texture |
|---------------|---------------------|
| 1x1 | Construction32.gif |
| 2x2 | Construction64.gif |
| 3x3 | Construction128.gif |
| 4x4 | Construction192.gif |
| 5x5 | Construction256.gif |
| 6x6+ | Construction256.gif |
| 7x7+ | Construction320.gif |

---

## Building Size Summary by Category

| Category | XSize | YSize | Notes |
|----------|-------|-------|-------|
| Headquarters | 2 | 2 | All clusters |
| Residential (LoCost) | 2 | 2 | Some Mariko 1x1 |
| Residential (Standard) | 2 | 2 | Varies by building |
| Office Buildings | 2 | 2 | All clusters |
| Industries (Large) | 5 | 5 | Standard factories |
| Industries (Small) | 3 | 3 | Small variants |
| Commerce (Stores) | 2 | 2 | Food, Clothes, HHA, etc. |
| Commerce (Supermarkets) | 3 | 3 | Larger stores |
| Public Services | 2 | 2 | Hospitals, Schools, etc. |
| Parks (Small) | 5 | 5 | All clusters |
| Parks (Medium) | 7 | 7 | All clusters |
| Parks (Central) | 9 | 9 | All clusters |
| Landmarks | 4 | 4 | Liberty, Tower |
| Warehouses | 5 | 5 | Most UW facilities |
| Magna Residentials | 3 | 3 | Luxury buildings |
| Magna Movie Studio | 8 | 8 | Largest building |

---

## VisualStages Summary by Category

| Category | Default VisualStages | Pattern |
|----------|---------------------|---------|
| Industries | 1 | Base -> Base+1 |
| Commerce | 1 | Base -> Base+1 |
| Public Services | 1 | Base -> Base+1 |
| Headquarters | 1 | Base -> Base+1 |
| Residential (LoCost) | 1 | Base -> Base+1 |
| Residential (Standard) | 2 | Base -> Base+2 |
| Office Buildings | 2 | Base -> Base+2 |
| Magna Facilities | 2 | Base -> Base+2 |
| Warehouses (UW) | 3 | Base -> Base+3 |
| Landmarks (Liberty/Tower) | 5 | Base -> Base+5 |
| DissLowClassDomeD | 7 | Base -> Base+7 |

---

## Headquarters Upgrade Levels

### Inheritance Chain
Headquarters inherit from `TResearchCenter` which overrides `GetVisualClassId`:
```pascal
function TResearchCenter.GetVisualClassId : TVisualClassId;
begin
  result := min( UpgradeLevel - 1, MetaBlock.VisualStages - 1 );
end;
```

This means Headquarters **DO** have visual upgrade levels that affect VisualClass!

### Two Types of Headquarters

**1. Regular Headquarters** (e.g., PGIGeneralHeadquarter, vidFacility = 4901)
- VisualStages = 1 (default)
- Block.VisualClassId = min(UpgradeLevel - 1, 0) = always 0
- Construction: 4901, Complete: 4902
- Same visual for all upgrade levels

**2. Standalone Headquarters** (e.g., PGIGeneralHeadquarterSTA, vidFacility = 601)
- VisualStages = **5**
- Block.VisualClassId = min(UpgradeLevel - 1, 4)
- **Different visual for each upgrade level!**

### Standalone Headquarters VisualClass Calculation

**Formula**: `VisualClass = Base + Stage0.VisualStages (1) + Block.VisualClassId`

Where `Block.VisualClassId = min(UpgradeLevel - 1, VisualStages - 1)`

### PGI Standalone General Headquarters
| UpgradeLevel | Block.VisualClassId | VisualClass | Texture |
|--------------|---------------------|-------------|---------|
| Construction | - | 601 | Construction128.gif |
| 1 | 0 | 602 | MapPGIHQ164x32x0.gif |
| 2 | 1 | 603 | MapPGIHQ264x32x0.gif |
| 3 | 2 | 604 | MapPGIHQ364x32x0.gif |
| 4 | 3 | 605 | MapPGIHQ464x32x0.gif |
| 5+ | 4 | 606 | MapPGIHQ564x32x0.gif |

**Properties**: Base = 601, XSize = 3, YSize = 3, VisualStages = 5

### Mariko Standalone General Headquarters
| UpgradeLevel | Block.VisualClassId | VisualClass | Texture |
|--------------|---------------------|-------------|---------|
| Construction | - | 701 | Construction128.gif |
| 1 | 0 | 702 | MapMKOHQ164x32x0.gif |
| 2 | 1 | 703 | MapMKOHQ264x32x0.gif |
| 3 | 2 | 704 | MapMKOHQ364x32x0.gif |
| 4 | 3 | 705 | MapMKOHQ464x32x0.gif |
| 5+ | 4 | 706 | MapMKOHQ564x32x0.gif |

**Properties**: Base = 701, XSize = 3, YSize = 3, VisualStages = 5

### Dissidents Standalone General Headquarters
| UpgradeLevel | Block.VisualClassId | VisualClass | Texture |
|--------------|---------------------|-------------|---------|
| Construction | - | 651 | Construction128.gif |
| 1 | 0 | 652 | MapDisHQ164x32x0.gif |
| 2 | 1 | 653 | MapDisHQ264x32x0.gif |
| 3 | 2 | 654 | MapDisHQ364x32x0.gif |
| 4 | 3 | 655 | MapDisHQ464x32x0.gif |
| 5+ | 4 | 656 | MapDisHQ564x32x0.gif |

**Properties**: Base = 651, XSize = 3, YSize = 3, VisualStages = 5

### Moab Standalone General Headquarters
| UpgradeLevel | Block.VisualClassId | VisualClass | Texture |
|--------------|---------------------|-------------|---------|
| Construction | - | 751 | Construction128.gif |
| 1 | 0 | 752 | MapMoabHQ164x32x0.gif |
| 2 | 1 | 753 | MapMoabHQ264x32x0.gif |
| 3 | 2 | 754 | MapMoabHQ364x32x0.gif |
| 4 | 3 | 755 | MapMoabHQ464x32x0.gif |
| 5+ | 4 | 756 | MapMoabHQ564x32x0.gif |

**Properties**: Base = 751, XSize = 3, YSize = 3, VisualStages = 5

### Standalone Headquarters Summary Table
| Cluster | NewFacility Name | Base | XSize | YSize | VisualStages | Construction | Level 1 | Level 2 | Level 3 | Level 4 | Level 5 |
|---------|------------------|------|-------|-------|--------------|--------------|---------|---------|---------|---------|---------|
| PGI | PGIGeneralHeadquarterSTA | 601 | 3 | 3 | 5 | 601 | 602 | 603 | 604 | 605 | 606 |
| Mariko | MarikoGeneralHeadquarterSTA | 701 | 3 | 3 | 5 | 701 | 702 | 703 | 704 | 705 | 706 |
| Dissidents | DissGeneralHeadquarterSTA | 651 | 3 | 3 | 5 | 651 | 652 | 653 | 654 | 655 | 656 |
| Moab | MoabGeneralHeadquarterSTA | 751 | 3 | 3 | 5 | 751 | 752 | 753 | 754 | 755 | 756 |

### Key Points
- Standalone HQ are unique per company (UniquenessMask = $00000001)
- They are larger (3x3) than regular HQ (2x2)
- They have 5 different visual appearances based on upgrade level
- The UpgradeLevel affects the VisualClass sent in ObjectsInArea

---

## Empty Residential Building VisualClass IDs

Empty residential buildings have a separate visual state when the building has no residents. The "Empty" texture is typically at **Base + 1** for standard residential buildings (between construction and fully occupied states).

For buildings with VisualStages=2:
- **Construction**: Base (e.g., 4301)
- **Empty/Partially Built**: Base + 1 (e.g., 4302)
- **Complete/Occupied**: Base + 2 (e.g., 4303)

The Empty VisualClass corresponds to the intermediate state. The texture naming pattern is:
`Map[Cluster][BuildingType]Empty64x32x0.gif`

Examples:
- PGIHighClassBuildingD Empty: 4332 -> MapPGIHiResDEmpty64x32x0.gif
- MKOMiddleClassBuildingA Empty: 3352 -> MapMKOMiResAEmpty64x32x0.gif
- DisMiddleClassBuildingC Empty: 2562 -> MapDisMiResCEmpty64x32x0.gif
