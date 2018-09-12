#!/usr/bin/env python3

import sys
import re
import numpy as np
import matplotlib.pyplot as plt

with open(sys.argv[1], 'r') as myfile:
    data = myfile.read()
    generations = [ match.groups()[0].split(', ') for match in re.compile(r'Generation \(\d+\) costs: ((?:[\-\d.]+(?:, )?)+)<br><br>').finditer(data) ]
    costs = [ [ float(cost) for cost in generationCostString ] for generationCostString in generations ]

    x = []
    y = []

    for idx, generation in enumerate(costs):
        for cost in generation:
            x.append(idx)
            y.append(cost)

    plt.scatter(x, y)
    plt.show()
