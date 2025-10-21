/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
import { Player } from "horizon/core";
import { AnimatedBinding, Binding, Image, ImageSource, UINode, View } from "horizon/ui";
import { LazyImageSource, missing_texture, UI_Utils } from "UI_Utils";

export class UIViewModel_CriticalHit {
  private icn_triangle = new LazyImageSource(BigInt(482839381519969));
  private shovelIcon = new Binding<ImageSource>(missing_texture.getImage());
  private abilityIcon = new Binding<ImageSource>(missing_texture.getImage());
  private showAbility = new Binding(true);
  private categoryName = new Binding("");
  private categoryBGColor = new Binding("");

  scale = new AnimatedBinding(0);
  translateX = new AnimatedBinding(0);
  translateY = new AnimatedBinding(0);
  opacity = new AnimatedBinding(1);

  constructor(private localPlayer: Player) { }

  setShovelAbility(shovelIcon: ImageSource, abilityIcon: ImageSource) {
    this.showAbility.set(true, [this.localPlayer]);
    this.shovelIcon.set(shovelIcon, [this.localPlayer]);
    this.abilityIcon.set(abilityIcon, [this.localPlayer]);
  }

  setShovelCategory(shovelIcon: ImageSource, categoryName: string, categoryBGColor: string) {
    this.showAbility.set(false, [this.localPlayer]);
    this.shovelIcon.set(shovelIcon, [this.localPlayer]);
    this.categoryName.set(categoryName, [this.localPlayer]);
    this.categoryBGColor.set(categoryBGColor, [this.localPlayer]);
  }

  getView() {
    const root = View({ //UICriticalHit
      children: [
        View({ //Critcal Hit Widget
          children: [
            View({ //Bubble Group
              children: [
                UINode.if(this.showAbility,
                  Image({ //icn_ability
                    source: this.abilityIcon,
                    style: {
                      width: 54,
                      height: 54,
                    }
                  }),
                 View({ //Type Tag
                    children: [
                      UI_Utils.outlinedText({ // Tag
                        text: this.categoryName,
                        outlineSize: 1,
                        style: {
                          color: "#FFF",
                          fontSize: 20,
                          textAlign: "center",
                          height: 24,
                          width: 100,
                          fontFamily: "Roboto",
                          fontWeight: "700"
                        }
                      }),
                    ],
                    style: {
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      borderRadius: 16,
                      height: 28,
                      backgroundColor: this.categoryBGColor,
                      flexDirection: "row",
                      //paddingVertical: 4,
                      paddingHorizontal: 16,
                      // marginRight: 7,
                    }
                  })
                ),
                Image({ //icn_triangle
                  source: this.icn_triangle.getImage(),
                  style: {
                    width: 28,
                    height: 28,
                    position: "absolute",
                    right: -21,
                    alignSelf: "center"
                  }
                })],
              style: {
                display: "flex",
                padding: 4,
                alignItems: "flex-start",
                borderRadius: 18,
                borderWidth: 2,
                borderColor: "#FFF",
                backgroundColor: "#FFF8D7",
                flexDirection: "row"
              }
            }),
            Image({ //icn_shovel
              source: this.shovelIcon,
              style: {
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                width: 100,
                height: 100,
                right: 20,
              }
            })],
          style: {
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            borderRadius: 8,
            flexDirection: "row",
            position: "absolute",
            opacity: this.opacity,
            transform: [
              { translateX: this.translateX },
              { translateY: this.translateY },
              { scale: this.scale },
            ]
          }
        })],
      style: {
        display: "flex",
        width: "100%",
        height: "100%",
        justifyContent: "center",
        alignItems: "center",
        position: "relative"
      }
    })
    return root;
  }
}
